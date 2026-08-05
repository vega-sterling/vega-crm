// ============================================================================
// POST /api/email/sequences/[id]/enroll — Vega CRM
// ============================================================================
// Enroll a contact into an email sequence. Creates a SequenceEnrollment record
// and sends the first step immediately via the connected Gmail account.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { google } from 'googleapis';
import { ActivitySource, ActivityType } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

const EnrollSchema = z.object({
  contactId: z.cuid(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function makeRawEmail(from: string, to: string, subject: string, body: string): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
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
 * POST /api/email/sequences/[id]/enroll
 *
 * @param req - { contactId }
 * @returns { enrollment, emailMessage? }
 */
export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id: sequenceId } = await context.params;

  const body = await validateBody(req, EnrollSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return errorResponse('Forbidden', 403);
  }

  const sequence = await prisma.emailSequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  });
  if (!sequence) return errorResponse('Sequence not found', 404);
  if (tenantIds && !tenantIds.includes(sequence.tenantId)) {
    return errorResponse('Forbidden', 403);
  }
  if (!sequence.isActive) {
    return errorResponse('Sequence is not active', 400);
  }
  if (sequence.steps.length === 0) {
    return errorResponse('Sequence has no steps', 400);
  }

  const contact = await prisma.contact.findUnique({
    where: { id: body.contactId },
    select: { id: true, email: true, companyId: true, tenantId: true, isActive: true },
  });
  if (!contact || !contact.isActive || !contact.email) {
    return errorResponse('Contact not found or has no email', 404);
  }
  if (contact.tenantId !== sequence.tenantId) {
    return errorResponse('Contact does not belong to sequence tenant', 403);
  }

  const existingEnrollment = await prisma.sequenceEnrollment.findFirst({
    where: { sequenceId, contactId: contact.id, status: { not: 'UNSUBSCRIBED' } },
    select: { id: true },
  });
  if (existingEnrollment) {
    return errorResponse('Contact is already enrolled in this sequence', 409);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { id: true, googleRefreshToken: true, googleEmail: true },
  });

  if (!user || !hasGoogleConnection(user)) {
    return errorResponse('Google account not connected', 400);
  }

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const firstStep = sequence.steps[0];

  const enrollment = await prisma.$transaction(async (tx) => {
    const created = await tx.sequenceEnrollment.create({
      data: {
        sequenceId,
        contactId: contact.id,
        tenantId: sequence.tenantId,
        status: 'ACTIVE',
      },
    });

    await tx.sequenceEnrollmentStep.create({
      data: {
        enrollmentId: created.id,
        stepId: firstStep.id,
        status: 'PENDING',
      },
    });

    return created;
  });

  // Send first step immediately via Gmail.
  let emailMessage = null;
  try {
    // Load the template for the first step if it exists
    const template = firstStep.templateId
      ? await prisma.emailTemplate.findUnique({ where: { id: firstStep.templateId } })
      : null;
    const subject = template?.subject || `Step ${firstStep.stepNumber}`;
    const body = template?.body || '';

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const raw = makeRawEmail(user.googleEmail!, contact.email, subject, body);
    const sent = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    emailMessage = await prisma.emailMessage.create({
      data: {
        tenantId: sequence.tenantId,
        userId: session.userId!,
        companyId: contact.companyId,
        contactId: contact.id,
        threadId: sent.data.threadId ?? null,
        messageId: sent.data.id ?? null,
        direction: 'outbound',
        fromEmail: user.googleEmail!,
        toEmails: [contact.email],
        ccEmails: [],
        subject: subject,
        bodyHtml: body,
        sentAt: new Date(),
        syncedAt: new Date(),
      },
    });

    await prisma.activity.create({
      data: {
        tenantId: sequence.tenantId,
        companyId: contact.companyId,
        contactId: contact.id,
        userId: session.userId!,
        type: ActivityType.EMAIL,
        subject: `Sequence: ${sequence.name} — ${subject}`,
        description: `Sent sequence email to ${contact.email}`,
        emailFrom: user.googleEmail!,
        emailTo: contact.email,
        emailBody: body,
        source: ActivitySource.GMAIL,
        externalId: sent.data.id ?? null,
      },
    });

    await prisma.sequenceEnrollmentStep.updateMany({
      where: {
        enrollmentId: enrollment.id,
        stepId: firstStep.id,
      },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch (err) {
    console.error('Failed to send first sequence step:', err);
    // Leave enrollment created; the step stays PENDING/FAILED for retry.
    await prisma.sequenceEnrollmentStep.updateMany({
      where: {
        enrollmentId: enrollment.id,
        stepId: firstStep.id,
      },
      data: { status: 'FAILED' },
    });
  }

  return NextResponse.json({ enrollment, emailMessage }, { status: 201 });
}
