// ============================================================================
// POST /api/public/bookings — Vega CRM
// ============================================================================
// Public endpoint (no auth) for prospects to book a time slot.
// Creates a Booking record + Activity + Google Calendar event.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const PublicBookingSchema = z.object({
  slotId: z.cuid(),
  startAt: z.coerce.date(),
  name: z.string().min(1, 'Name is required'),
  email: z.email('Valid email is required'),
  company: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = PublicBookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { slotId, startAt, name, email, company, notes } = parsed.data;

    // Verify slot exists and is active
    const slot = await prisma.bookingSlot.findFirst({
      where: { id: slotId, isActive: true },
    });

    if (!slot) {
      return NextResponse.json({ error: 'Booking slot not found' }, { status: 404 });
    }

    const endAt = new Date(startAt.getTime() + slot.durationMin * 60000);

    // Check for double-booking
    const existing = await prisma.booking.findMany({
      where: {
        slot: { userId: slot.userId },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    });

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'This time slot was just booked. Please select another time.' },
        { status: 409 }
      );
    }

    // Find or create company for the contact (Contact requires companyId)
    let companyId: string | undefined;
    if (company) {
      // Try to find existing company by name in this tenant
      const existingCo = await prisma.company.findFirst({
        where: { tenantId: slot.tenantId, name: { contains: company, mode: 'insensitive' } },
      });
      companyId = existingCo?.id;
      if (!companyId) {
        const newCompany = await prisma.company.create({
          data: { tenantId: slot.tenantId, name: company },
        });
        companyId = newCompany.id;
      }
    } else {
      // Find a default company in the tenant
      const defaultCo = await prisma.company.findFirst({
        where: { tenantId: slot.tenantId },
      });
      companyId = defaultCo?.id;
      if (!companyId) {
        // Create a generic company if none exists
        const newCompany = await prisma.company.create({
          data: { tenantId: slot.tenantId, name: 'General' },
        });
        companyId = newCompany.id;
      }
    }

    // Find or create contact
    let contact = await prisma.contact.findFirst({ where: { email } });
    if (!contact) {
      const [firstName, ...rest] = name.split(' ');
      contact = await prisma.contact.create({
        data: {
          tenantId: slot.tenantId,
          companyId,
          firstName: firstName || name,
          lastName: rest.join(' ') || '',
          email,
        },
      });
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        bookingSlotId: slotId,
        slotId,
        contactId: contact.id,
        contactName: name,
        contactEmail: email,
        startAt,
        endAt,
        status: 'CONFIRMED',
        notes: notes || null,
      },
    });

    // Log activity (only if we have a companyId — it's required)
    if (companyId) {
      await prisma.activity.create({
        data: {
          tenantId: slot.tenantId,
          contactId: contact.id,
          companyId,
          userId: slot.userId,
          type: 'MEETING',
          source: 'MANUAL',
          subject: `Meeting booked: ${name} (${email})`,
          description: `Duration: ${slot.durationMin} min${notes ? `\nNotes: ${notes}` : ''}`,
          scheduledAt: startAt,
        },
      });
    }

    // Try Google Calendar event
    try {
      const { getGoogleClientForUser, hasGoogleConnection } = await import('@/lib/google');
      const user = await prisma.user.findUnique({
        where: { id: slot.userId },
        select: { googleEmail: true, googleRefreshToken: true, name: true },
      });

      if (user && hasGoogleConnection(user)) {
        const oauth2Client = await getGoogleClientForUser(slot.userId);
        if (oauth2Client) {
          const { google } = await import('googleapis');
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: `Meeting with ${name}`,
              description: notes || `Booked via Vega CRM\nEmail: ${email}${company ? `\nCompany: ${company}` : ''}`,
              start: { dateTime: startAt.toISOString() },
              end: { dateTime: endAt.toISOString() },
              attendees: [{ email }, ...(user.googleEmail ? [{ email: user.googleEmail }] : [])],
            },
          });
          // Save Google event ID
          await prisma.booking.update({
            where: { id: booking.id },
            data: { googleEventId: event.data.id || null },
          });
        }
      }
    } catch (calError) {
      console.error('Calendar event creation failed (non-blocking):', calError);
    }

    return NextResponse.json({
      data: {
        id: booking.id,
        startAt: booking.startAt,
        endAt: booking.endAt,
        status: booking.status,
        contactName: name,
        contactEmail: email,
      },
      message: 'Booking confirmed! A calendar invitation has been sent.',
    });
  } catch (error) {
    console.error('Public booking error:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}