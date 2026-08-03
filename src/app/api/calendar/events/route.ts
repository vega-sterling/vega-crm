// ============================================================================
// GET, POST /api/calendar/events — Vega CRM
// ============================================================================
// GET: List upcoming calendar events from Google Calendar (next 30 days).
// POST: Create a calendar event via Google Calendar API and persist a local
//       CalendarEvent record plus an Activity.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { google, calendar_v3 } from 'googleapis';
import { ActivitySource, ActivityType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';
import { getGoogleClientForUser, hasGoogleConnection } from '@/lib/google';

const CalendarEventCreateSchema = z.object({
  tenantId: z.string().cuid(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attendees: z.array(z.string().email()).optional().default([]),
  companyId: z.string().cuid().optional().nullable(),
  contactId: z.string().cuid().optional().nullable(),
  status: z.enum(['CONFIRMED', 'TENTATIVE', 'CANCELLED']).optional().default('CONFIRMED'),
});

/**
 * GET /api/calendar/events
 *
 * @query tenantId - optional tenant filter
 * @query from - ISO start date (defaults to now)
 * @query to - ISO end date (defaults to now + 30 days)
 * @query page - page number
 * @query limit - page size
 * @returns Google Calendar events + local CalendarEvent records
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { googleRefreshToken: true, googleEmail: true },
  });
  if (!user || !hasGoogleConnection(user)) {
    return errorResponse('Google account not connected', 400);
  }

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const timeMin = fromParam ? new Date(fromParam).toISOString() : now.toISOString();
  const timeMax = toParam ? new Date(toParam).toISOString() : thirtyDays.toISOString();

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: limit,
    });

    const events = response.data.items ?? [];

    return NextResponse.json({
      data: events,
      googleCalendar: {
        timeMin,
        timeMax,
        total: events.length,
      },
      pagination: { page, limit, total: events.length, pages: Math.ceil(events.length / limit) },
    });
  } catch (err) {
    console.error('Google Calendar events.list failed:', err);
    return errorResponse('Failed to fetch calendar events', 502);
  }
}

/**
 * POST /api/calendar/events
 *
 * @param req - { tenantId, title, description?, location?, startTime, endTime,
 *                attendees[], companyId?, contactId?, status? }
 * @returns Created CalendarEvent record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, CalendarEventCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  if (body.endTime <= body.startTime) {
    return errorResponse('End time must be after start time', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId! },
    select: { googleRefreshToken: true, googleEmail: true },
  });
  if (!user || !hasGoogleConnection(user)) {
    return errorResponse('Google account not connected', 400);
  }

  const oauth2Client = await getGoogleClientForUser(session.userId!);
  if (!oauth2Client) {
    return errorResponse('Failed to refresh Google access token', 500);
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const attendees: calendar_v3.Schema$EventAttendee[] = (body.attendees || []).map((email: string) => ({ email }));
  attendees.push({ email: user.googleEmail!, responseStatus: 'accepted' });

  let googleEvent: calendar_v3.Schema$Event;
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: body.title,
        description: body.description ?? undefined,
        location: body.location ?? undefined,
        start: { dateTime: body.startTime.toISOString(), timeZone: 'UTC' },
        end: { dateTime: body.endTime.toISOString(), timeZone: 'UTC' },
        attendees,
      },
    });
    googleEvent = response.data;
  } catch (err) {
    console.error('Google Calendar events.insert failed:', err);
    return errorResponse('Failed to create calendar event', 502);
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: body.tenantId,
      userId: session.userId!,
      googleEventId: googleEvent.id ?? null,
      title: body.title,
      description: body.description || null,
      location: body.location || null,
      startAt: body.startTime,
      endAt: body.endTime,
      attendees: body.attendees,
      companyId: body.companyId || null,
      contactId: body.contactId || null,
      status: body.status,
    },
  });

  // Only create activity if companyId is provided (Activity model requires it)
  if (body.companyId) {
    await prisma.activity.create({
      data: {
        tenantId: body.tenantId,
        companyId: body.companyId,
        contactId: body.contactId || undefined,
        userId: session.userId!,
        type: ActivityType.MEETING,
        subject: body.title,
        description: body.description || null,
        scheduledAt: body.startTime,
        source: ActivitySource.GMAIL,
        externalId: googleEvent.id ?? null,
      },
    });
  }

  return NextResponse.json({ event, googleEvent }, { status: 201 });
}
