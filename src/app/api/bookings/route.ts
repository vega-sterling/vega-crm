// ============================================================================
// GET, POST /api/bookings — Vega CRM
// ============================================================================
// GET: List available booking slots for a user over a date range.
// POST: A prospect books a time slot, creating a local Booking record,
//       blocking the calendar with a CalendarEvent, and logging an Activity.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { google, calendar_v3 } from 'googleapis';
import { ActivitySource, ActivityType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

const BookingCreateSchema = z.object({
  bookingSlotId: z.string().cuid(),
  contactId: z.string().cuid(),
  companyId: z.string().cuid().optional().nullable(),
  scheduledAt: z.coerce.date(),
  notes: z.string().optional().nullable(),
});

interface AvailableSlot {
  bookingSlotId: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  weekday: number;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function addMinutesToIso(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
}

function getSlotInstances(
  slot: { id: string; dayOfWeek: number; startTime: string; endTime: string; durationMin: number },
  from: Date,
  to: Date,
  existingBookings: { startAt: Date; endAt: Date }[]
): AvailableSlot[] {
  const results: AvailableSlot[] = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= to) {
    if (cursor.getUTCDay() === slot.dayOfWeek) {
      const baseIso = cursor.toISOString().slice(0, 10);
      const startIso = `${baseIso}T${slot.startTime}:00.000Z`;
      const slotEndIso = `${baseIso}T${slot.endTime}:00.000Z`;

      let current = new Date(startIso);
      const slotEnd = new Date(slotEndIso);
      const durationMs = slot.durationMin * 60 * 1000;

      while (current.getTime() + durationMs <= slotEnd.getTime()) {
        const startAt = current.toISOString();
        const endAt = new Date(current.getTime() + durationMs).toISOString();

        const isBooked = existingBookings.some(
          (b) =>
            new Date(startAt) < new Date(b.endAt.toISOString()) &&
            new Date(endAt) > new Date(b.startAt.toISOString())
        );

        if (!isBooked) {
          results.push({
            bookingSlotId: slot.id,
            startAt,
            endAt,
            durationMinutes: slot.durationMin,
            weekday: slot.dayOfWeek,
          });
        }

        current = new Date(current.getTime() + durationMs);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

/**
 * GET /api/bookings
 *
 * @query userId - host user whose slots to query (defaults to current user)
 * @query from - ISO date (defaults to today)
 * @query to - ISO date (defaults to today + 14 days)
 * @returns Available booking slot instances
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : now;
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : twoWeeks;
  const userId = searchParams.get('userId') ?? session.userId!;

  const where: Record<string, unknown> = {
    userId,
    isActive: true,
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  const slots = await prisma.bookingSlot.findMany({ where });
  const existingBookings = await prisma.booking.findMany({
    where: {
      slot: { userId },
      status: { not: 'CANCELLED' },
      startAt: { gte: from },
      endAt: { lte: to },
    },
    select: { startAt: true, endAt: true },
  });

  const available = slots.flatMap((slot) => getSlotInstances(slot, from, to, existingBookings));
  available.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return NextResponse.json({ slots: available });
}

/**
 * POST /api/bookings
 *
 * @param req - { bookingSlotId, contactId, companyId?, scheduledAt, notes? }
 * @returns { booking, calendarEvent?, activity? }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, BookingCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return errorResponse('Forbidden', 403);
  }

  const slot = await prisma.bookingSlot.findUnique({
    where: { id: body.bookingSlotId },
    include: { user: { select: { id: true, email: true, googleEmail: true, googleRefreshToken: true } } },
  });
  if (!slot) return errorResponse('Booking slot not found', 404);
  if (tenantIds && !tenantIds.includes(slot.tenantId)) {
    return errorResponse('Forbidden', 403);
  }
  if (!slot.isActive) {
    return errorResponse('Booking slot is inactive', 400);
  }

  const contact = await prisma.contact.findUnique({
    where: { id: body.contactId },
    select: { id: true, email: true, firstName: true, lastName: true, companyId: true, tenantId: true, isActive: true },
  });
  if (!contact || !contact.isActive) {
    return errorResponse('Contact not found', 404);
  }
  if (contact.tenantId !== slot.tenantId) {
    return errorResponse('Contact does not belong to slot tenant', 403);
  }

  const scheduledDate = new Date(body.scheduledAt);
  if (scheduledDate.getUTCDay() !== slot.dayOfWeek) {
    return errorResponse('Scheduled time does not match slot weekday', 400);
  }

  const slotStart = `${scheduledDate.toISOString().slice(0, 10)}T${slot.startTime}:00.000Z`;
  const slotEnd = `${scheduledDate.toISOString().slice(0, 10)}T${slot.endTime}:00.000Z`;
  if (
    scheduledDate < new Date(slotStart) ||
    new Date(scheduledDate.getTime() + slot.durationMin * 60 * 1000) > new Date(slotEnd)
  ) {
    return errorResponse('Scheduled time is outside slot window', 400);
  }

  const endAt = new Date(scheduledDate.getTime() + slot.durationMin * 60 * 1000);

  const conflict = await prisma.booking.findFirst({
    where: {
      slot: { userId: slot.userId },
      status: { not: 'CANCELLED' },
      startAt: { lt: endAt },
      endAt: { gt: scheduledDate },
    },
    select: { id: true },
  });
  if (conflict) {
    return errorResponse('Time slot is already booked', 409);
  }

  let googleEvent: calendar_v3.Schema$Event | null = null;
  if (hasGoogleConnection(slot.user)) {
    const oauth2Client = await getGoogleClientForUser(slot.user.id);
    if (oauth2Client) {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      try {
        const response = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: `Booking: ${contact.firstName} ${contact.lastName}`,
            description: body.notes ?? undefined,
            start: { dateTime: scheduledDate.toISOString(), timeZone: 'UTC' },
            end: { dateTime: endAt.toISOString(), timeZone: 'UTC' },
            attendees: [{ email: contact.email }].filter(Boolean) as calendar_v3.Schema$EventAttendee[],
          },
        });
        googleEvent = response.data;
      } catch (err) {
        console.error('Failed to create booking calendar event:', err);
      }
    }
  }

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        bookingSlotId: slot.id,
        slotId: slot.id,
        contactId: contact.id,
        companyId: body.companyId || contact.companyId,
        contactName: `${contact.firstName} ${contact.lastName}`,
        contactEmail: contact.email,
        startAt: scheduledDate,
        endAt,
        status: 'CONFIRMED',
        notes: body.notes || null,
        googleEventId: googleEvent?.id ?? null,
        scheduledAt: scheduledDate,
      },
    });

    await tx.calendarEvent.create({
      data: {
        tenantId: slot.tenantId,
        userId: slot.userId,
        googleEventId: googleEvent?.id ?? null,
        title: `Booking: ${contact.firstName} ${contact.lastName}`,
        description: body.notes || null,
        startAt: scheduledDate,
        endAt,
        attendees: [contact.email].filter(Boolean) as string[],
        companyId: body.companyId || contact.companyId,
        contactId: contact.id,
        status: 'CONFIRMED',
      },
    });

    await tx.activity.create({
      data: {
        tenantId: slot.tenantId,
        companyId: body.companyId || contact.companyId,
        contactId: contact.id,
        userId: slot.userId,
        type: ActivityType.MEETING,
        subject: `Booking: ${contact.firstName} ${contact.lastName}`,
        description: body.notes || null,
        scheduledAt: scheduledDate,
        source: ActivitySource.MANUAL,
        externalId: googleEvent?.id ?? null,
      },
    });

    return created;
  });

  const populated = await prisma.booking.findUnique({
    where: { id: booking.id },
    include: { slot: true, contact: true, company: true },
  });

  return NextResponse.json({ booking: populated, calendarEvent: googleEvent }, { status: 201 });
}
