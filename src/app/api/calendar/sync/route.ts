// ============================================================================
// POST /api/calendar/sync — Vega CRM
// ============================================================================
// Syncs events from the user's Google Calendar (next 30 days) into local
// CalendarEvent records, creating Activity records for meetings. Skips events
// that already exist by googleEventId.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { google, calendar_v3 } from 'googleapis';
import { ActivitySource, ActivityType } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

interface SyncedEvent {
  googleEventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
}

function parseCalendarDateTime(
  start?: calendar_v3.Schema$EventDateTime,
  end?: calendar_v3.Schema$EventDateTime
): { startAt: Date; endAt: Date } | null {
  const startRaw = start?.dateTime ?? start?.date;
  const endRaw = end?.dateTime ?? end?.date;
  if (!startRaw || !endRaw) return null;

  const startAt = new Date(startRaw);
  const endAt = new Date(endRaw);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return null;
  return { startAt, endAt };
}

/**
 * POST /api/calendar/sync
 *
 * @returns { synced: number, skipped: number }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { googleRefreshToken: true, googleEmail: true },
  });
  if (!user || !hasGoogleConnection(user)) {
    return errorResponse('Google account not connected', 400);
  }

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ synced: 0, skipped: 0 });
  }

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let googleEvents: calendar_v3.Schema$Event[] = [];
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: thirtyDays.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });
    googleEvents = response.data.items ?? [];
  } catch (err) {
    console.error('Google Calendar sync failed:', err);
    return errorResponse('Failed to sync calendar events', 502);
  }

  let synced = 0;
  let skipped = 0;

  for (const event of googleEvents) {
    const googleEventId = event.id;
    if (!googleEventId) continue;

    const existing = await prisma.calendarEvent.findFirst({
      where: { googleEventId },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const times = parseCalendarDateTime(event.start, event.end);
    if (!times) continue;

    // Try to match attendees to a contact by email.
    const attendeeEmails = (event.attendees ?? [])
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => Boolean(e));
    const organizerEmail = event.organizer?.email?.toLowerCase();
    const fromAttendees = attendeeEmails.filter((e) => e !== organizerEmail && e !== user.googleEmail?.toLowerCase());

    let matchedContact: { id: string; companyId: string | null; tenantId: string } | null = null;
    for (const email of fromAttendees) {
      const contact = await prisma.contact.findFirst({
        where: {
          email,
          isActive: true,
          tenantId: tenantIds ? { in: tenantIds } : undefined,
        },
        select: { id: true, companyId: true, tenantId: true },
      });
      if (contact) {
        matchedContact = contact;
        break;
      }
    }

    const tenantId = matchedContact?.tenantId ?? (tenantIds ? tenantIds[0] : 'default');

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.calendarEvent.create({
          data: {
            tenantId,
            userId: session.userId!,
            googleEventId,
            title: event.summary ?? '(no title)',
            description: event.description ?? null,
            location: event.location ?? null,
            startAt: times.startAt,
            endAt: times.endAt,
            attendees: attendeeEmails,
            companyId: matchedContact?.companyId ?? null,
            contactId: matchedContact?.id ?? null,
            status: 'CONFIRMED',
          },
        });

        // Only create activity if we matched a contact (Activity requires companyId)
        if (matchedContact) {
          await tx.activity.create({
            data: {
              tenantId,
              companyId: matchedContact.companyId!,
              contactId: matchedContact.id,
              userId: session.userId!,
              type: ActivityType.MEETING,
              subject: event.summary ?? 'Calendar event',
              description: event.description || null,
              scheduledAt: times.startAt,
              source: ActivitySource.GMAIL,
              externalId: googleEventId,
            },
          });
        }

        return created;
      });

      synced += 1;
    } catch (err) {
      console.error(`Failed to sync event ${googleEventId}:`, err);
      skipped += 1;
    }
  }

  return NextResponse.json({ synced, skipped });
}
