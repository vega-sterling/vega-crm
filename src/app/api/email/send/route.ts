// ============================================================================
// POST /api/email/send — Vega CRM
// ============================================================================
// Sends an outbound email via the Gmail API using the authenticated user's
// stored OAuth token. Creates an EmailMessage record and a linked Activity.
// Refreshes the access token automatically if expired.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { google, gmail_v1 } from 'googleapis';
import { ActivitySource, ActivityType } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

const EmailSendSchema = z.object({
  tenantId: z.cuid(),
  to: z.array(z.email()).min(1),
  cc: z.array(z.email()).optional().default([]),
  subject: z.string().min(1),
  body: z.string().min(1),
  contactId: z.cuid().optional().nullable(),
  companyId: z.cuid().optional().nullable(),
  dealId: z.cuid().optional().nullable(),
});

function makeEmailMessage(
  from: string,
  to: string[],
  cc: string[],
  subject: string,
  body: string
): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const lines = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * POST /api/email/send
 *
 * @param req - { tenantId, to[], cc[], subject, body, contactId?, companyId?, dealId? }
 * @returns Sent EmailMessage record with Gmail messageId / threadId
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, EmailSendSchema);
  if (body instanceof NextResponse) return body;

  // Validate tenant access.
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  // Validate related records belong to the same tenant when provided.
  if (body.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: body.companyId },
      select: { tenantId: true },
    });
    if (!company || company.tenantId !== body.tenantId) {
      return errorResponse('Company not found in tenant', 404);
    }
  }
  if (body.contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: body.contactId },
      select: { tenantId: true, companyId: true },
    });
    if (!contact || contact.tenantId !== body.tenantId) {
      return errorResponse('Contact not found in tenant', 404);
    }
  }
  if (body.dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: body.dealId },
      select: { tenantId: true },
    });
    if (!deal || deal.tenantId !== body.tenantId) {
      return errorResponse('Deal not found in tenant', 404);
    }
  }

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

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const rawMessage = makeEmailMessage(user.googleEmail!, body.to, body.cc || [], body.subject, body.body);

  let sent: gmail_v1.Schema$Message;
  try {
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    });
    sent = response.data;
  } catch (err) {
    console.error('Gmail send failed:', err);
    return errorResponse('Failed to send email via Gmail', 502);
  }

  const emailMessage = await prisma.emailMessage.create({
    data: {
      tenantId: body.tenantId,
      userId: session.userId!,
      companyId: body.companyId || null,
      contactId: body.contactId || null,
      dealId: body.dealId || null,
      threadId: sent.threadId ?? null,
      messageId: sent.id ?? null,
      direction: 'outbound',
      fromEmail: user.googleEmail!,
      toEmails: body.to,
      ccEmails: body.cc,
      subject: body.subject,
      bodyHtml: body.body,
      sentAt: new Date(),
      syncedAt: new Date(),
      isReplied: false,
    },
  });

  // Only create activity if companyId is provided (Activity model requires it)
  if (body.companyId) {
    await prisma.activity.create({
      data: {
        tenantId: body.tenantId,
        companyId: body.companyId,
        contactId: body.contactId || undefined,
        dealId: body.dealId || undefined,
        userId: session.userId!,
        type: ActivityType.EMAIL,
        subject: `Email: ${body.subject}`,
        description: `Sent email to ${body.to.join(', ')}`,
        emailFrom: user.googleEmail!,
        emailTo: body.to.join(', '),
        emailCc: body.cc?.join(', ') || null,
        emailBody: body.body,
        source: ActivitySource.GMAIL,
        externalId: sent.id ?? null,
      },
    });
  }

  return NextResponse.json({ emailMessage }, { status: 201 });
}
