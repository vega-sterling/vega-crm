// ============================================================================
// POST /api/email/sync — Vega CRM
// ============================================================================
// Syncs inbound Gmail messages that are replies to threads we sent. Only
// imports emails whose From address matches an existing CRM contact. This
// route NEVER deletes or marks Gmail messages as read.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { google, gmail_v1 } from 'googleapis';
import { ActivitySource, ActivityType, Prisma } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

// Max messages to inspect per sync run to avoid long timeouts.
const SYNC_PAGE_SIZE = 50;

interface ParsedMessage {
  messageId: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date | null;
}

function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const value = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  return value;
}

function parseAddresses(value: string): string[] {
  return value
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const match = a.match(/<([^>]+)>/);
      return match ? match[1].toLowerCase() : a.toLowerCase();
    });
}

function findBody(parts: gmail_v1.Schema$MessagePart[] | undefined): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  const walk = (parts: gmail_v1.Schema$MessagePart[] | undefined) => {
    if (!parts) return;
    for (const part of parts) {
      const mimeType = part.mimeType ?? '';
      if (mimeType === 'text/plain' && part.body?.data && !text) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (mimeType === 'text/html' && part.body?.data && !html) {
        html = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) walk(part.parts);
    }
  };

  walk(parts);
  return { text, html };
}

/**
 * POST /api/email/sync
 *
 * Fetches new inbound messages from the user's Gmail inbox and imports replies
 * to threads previously sent from Vega. Returns the count of new emails synced.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: {
      id: true,
      googleRefreshToken: true,
      googleEmail: true,
      name: true,
    },
  });

  if (!user || !hasGoogleConnection(user)) {
    return errorResponse('Google account not connected', 400);
  }

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Threads we have sent outbound email from.
  const knownThreads = await prisma.emailMessage.findMany({
    where: {
      userId: session.userId!,
      direction: 'outbound',
      threadId: { not: null },
      tenantId: tenantIds ? { in: tenantIds } : undefined,
    },
    select: { threadId: true },
    distinct: ['threadId'],
  });
  const threadSet = new Set(knownThreads.map((t) => t.threadId).filter(Boolean) as string[]);

  if (threadSet.size === 0) {
    return NextResponse.json({ synced: 0 });
  }

  // Query Gmail for inbound messages, then filter to known threads.
  let messageList: gmail_v1.Schema$Message[] = [];
  try {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      maxResults: SYNC_PAGE_SIZE,
      q: 'in:inbox -from:me',
    });
    messageList = listRes.data.messages ?? [];
  } catch (err) {
    console.error('Gmail messages.list failed:', err);
    return errorResponse('Failed to list Gmail messages', 502);
  }

  let synced = 0;
  const now = new Date();

  for (const msgMeta of messageList) {
    if (!msgMeta.id) continue;

    // Skip messages we've already imported.
    const existing = await prisma.emailMessage.findFirst({
      where: { messageId: msgMeta.id },
      select: { id: true },
    });
    if (existing) continue;

    let full: gmail_v1.Schema$Message;
    try {
      const getRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgMeta.id,
        format: 'full',
      });
      full = getRes.data;
    } catch (err) {
      console.error(`Failed to fetch message ${msgMeta.id}:`, err);
      continue;
    }

    const headers = full.payload?.headers ?? [];
    const threadId = full.threadId ?? msgMeta.id;
    if (!threadSet.has(threadId)) continue;

    const fromEmail = parseAddresses(extractHeader(headers, 'From'))[0] ?? '';
    if (!fromEmail) continue;

    // Only import if the sender matches an active contact in our CRM.
    const matchingContact = await prisma.contact.findFirst({
      where: {
        email: fromEmail,
        isActive: true,
        tenantId: tenantIds ? { in: tenantIds } : undefined,
      },
      select: { id: true, companyId: true, tenantId: true },
    });

    if (!matchingContact) continue;

    const toHeader = extractHeader(headers, 'To');
    const ccHeader = extractHeader(headers, 'Cc');
    const subject = extractHeader(headers, 'Subject') ?? '(no subject)';
    const dateHeader = extractHeader(headers, 'Date');
    const receivedAt = dateHeader ? new Date(dateHeader) : now;
    if (isNaN(receivedAt.getTime())) receivedAt.setTime(now.getTime());

    const { text, html } = findBody(full.payload?.parts);

    try {
      await prisma.$transaction(async (tx) => {
        const emailMessage = await tx.emailMessage.create({
          data: {
            tenantId: matchingContact.tenantId,
            userId: session.userId!,
            companyId: matchingContact.companyId,
            contactId: matchingContact.id,
            threadId,
            messageId: msgMeta.id,
            direction: 'inbound',
            fromEmail,
            toEmails: parseAddresses(toHeader),
            ccEmails: parseAddresses(ccHeader),
            subject,
            bodyText: text,
            bodyHtml: html,
            receivedAt,
            syncedAt: now,
          },
        });

        await tx.emailMessage.updateMany({
          where: {
            threadId,
            direction: 'outbound',
            userId: session.userId!,
          },
          data: { isReplied: true },
        });

        await tx.activity.create({
          data: {
            tenantId: matchingContact.tenantId,
            companyId: matchingContact.companyId,
            contactId: matchingContact.id,
            userId: session.userId!,
            type: ActivityType.EMAIL,
            subject: `Re: ${subject}`,
            description: `Received email from ${fromEmail}`,
            emailFrom: fromEmail,
            emailTo: toHeader,
            emailCc: ccHeader || null,
            emailBody: text,
            source: ActivitySource.GMAIL,
            externalId: msgMeta.id,
          },
        });

        return emailMessage;
      });

      synced += 1;
    } catch (err) {
      console.error(`Failed to import message ${msgMeta.id}:`, err);
      // Continue syncing other messages.
    }
  }

  return NextResponse.json({ synced });
}
