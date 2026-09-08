// ============================================================================
// POST /api/contacts/merge — Vega CRM Contact Merge (Phase 39)
// ============================================================================
// Merges duplicateId into primaryId inside a single prisma.$transaction:
//   1. Load both contacts, verify same tenantId and accessible tenant (else 400).
//   2. Fill primary's null/empty fields from duplicate (email, phone, mobile,
//      title, department). Notes: append both with 'Merged:' marker when both
//      present. Tags: union deduped, primary's order first.
//   3. Re-point EVERY child relation duplicate→primary via updateMany BEFORE
//      deleting the duplicate — enumerated from prisma/schema.prisma:
//      Activity, Task, Deal, EmailMessage, SequenceEnrollment, CalendarEvent,
//      Booking. (SequenceEnrollment.contactId is required+Cascade, so re-point
//      MUST happen before the delete or enrollments would be destroyed.)
//   4. Delete the duplicate — the ONLY deletion, inside the transaction.
// Any failure rolls the whole transaction back; no partial state.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const MergeSchema = z
  .object({
    primaryId: z.string().cuid(),
    duplicateId: z.string().cuid(),
  })
  .refine((data) => data.primaryId !== data.duplicateId, {
    message: 'primaryId and duplicateId must be different',
    path: ['duplicateId'],
  });

const isEmpty = (v: string | null | undefined) => !v || v.trim() === '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, MergeSchema);
  if (body instanceof NextResponse) return body;

  const { primaryId, duplicateId } = body;
  const tenantIds = await getAccessibleTenantIds(session);

  try {
    const mergedContact = await prisma.$transaction(async (tx) => {
      // ── 1. Load both contacts inside the transaction ──
      const [primary, duplicate] = await Promise.all([
        tx.contact.findUnique({ where: { id: primaryId } }),
        tx.contact.findUnique({ where: { id: duplicateId } }),
      ]);

      if (!primary || !duplicate) {
        throw new MergeError('One or both contacts not found');
      }
      if (primary.tenantId !== duplicate.tenantId) {
        throw new MergeError('Contacts belong to different tenants');
      }
      if (tenantIds && !tenantIds.includes(primary.tenantId)) {
        throw new MergeError('Contacts are not in an accessible tenant');
      }

      // ── 2. Merge fields onto primary ──
      const data: {
        email?: string | null;
        phone?: string | null;
        mobile?: string | null;
        title?: string | null;
        department?: string | null;
        notes?: string | null;
        tags?: string[];
      } = {};

      if (isEmpty(primary.email) && !isEmpty(duplicate.email)) data.email = duplicate.email;
      if (isEmpty(primary.phone) && !isEmpty(duplicate.phone)) data.phone = duplicate.phone;
      if (isEmpty(primary.mobile) && !isEmpty(duplicate.mobile)) data.mobile = duplicate.mobile;
      if (isEmpty(primary.title) && !isEmpty(duplicate.title)) data.title = duplicate.title;
      if (isEmpty(primary.department) && !isEmpty(duplicate.department)) data.department = duplicate.department;

      if (!isEmpty(duplicate.notes)) {
        if (isEmpty(primary.notes)) {
          data.notes = duplicate.notes;
        } else {
          data.notes = `${primary.notes}\n\nMerged:\n${duplicate.notes}`;
        }
      }

      const tagSet = new Set<string>([...(primary.tags || []), ...(duplicate.tags || [])]);
      const tags = [...tagSet].filter((t) => t.trim() !== '');
      if (tags.length !== (primary.tags || []).length) data.tags = tags;

      if (Object.keys(data).length > 0) {
        await tx.contact.update({ where: { id: primaryId }, data });
      }

      // ── 3. Re-point EVERY contactId child relation duplicate→primary ──
      // (Enumerated from prisma/schema.prisma — Activity 293, Task 330,
      // Deal 499, EmailMessage 617, SequenceEnrollment 708, CalendarEvent 808,
      // Booking 861. SequenceEnrollment is required+Cascade → must re-point
      // BEFORE the delete.)
      await tx.activity.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.task.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.deal.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.emailMessage.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.sequenceEnrollment.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.calendarEvent.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.booking.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });

      // ── 4. Delete the duplicate (the ONLY deletion) ──
      await tx.contact.delete({ where: { id: duplicateId } });

      // Return fresh primary
      return tx.contact.findUnique({
        where: { id: primaryId },
        include: { company: { select: { id: true, name: true } } },
      });
    });

    return NextResponse.json({ merged: true, primaryId, mergedContact });
  } catch (err) {
    if (err instanceof MergeError) {
      return errorResponse(err.message, 400);
    }
    console.error('Merge failed:', err);
    return errorResponse('Merge failed — no changes were made', 500);
  }
}

class MergeError extends Error {}