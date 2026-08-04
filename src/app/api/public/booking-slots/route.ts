// ============================================================================
// GET /api/public/booking-slots — Vega CRM
// ============================================================================
// Public endpoint (no auth required) for the public booking page.
// Returns available time slots for a given user over the next 30 days.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    select: { id: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const slots = await prisma.bookingSlot.findMany({
    where: { userId, isActive: true },
    orderBy: { dayOfWeek: 'asc' },
  });

  if (slots.length === 0) {
    return NextResponse.json({ data: [], userName: user.name });
  }

  // Generate available time instances for next 30 days
  const now = new Date();
  const available: Array<{
    slotId: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    weekday: number;
  }> = [];

  // Get existing bookings to exclude
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const existingBookings = await prisma.booking.findMany({
    where: {
      slot: { userId },
      startAt: { gte: now, lt: thirtyDaysLater },
      status: { in: ['CONFIRMED', 'PENDING'] },
    },
    select: { startAt: true, endAt: true },
  });

  const isTimeBooked = (start: Date, end: Date): boolean => {
    return existingBookings.some((b) => {
      const bStart = new Date(b.startAt);
      const bEnd = new Date(b.endAt);
      return bStart < end && bEnd > start;
    });
  };

  for (let day = 0; day < 30; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    date.setHours(0, 0, 0, 0);
    const weekday = date.getDay();

    const daySlots = slots.filter((s) => s.dayOfWeek === weekday);
    for (const slot of daySlots) {
      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);

      const slotStart = new Date(date);
      slotStart.setHours(startH, startM, 0, 0);
      const slotEnd = new Date(date);
      slotEnd.setHours(endH, endM, 0, 0);

      let current = new Date(slotStart);
      while (current.getTime() + slot.durationMin * 60000 <= slotEnd.getTime()) {
        const end = new Date(current.getTime() + slot.durationMin * 60000);
        if (current.getTime() > now.getTime() && !isTimeBooked(current, end)) {
          available.push({
            slotId: slot.id,
            startAt: current.toISOString(),
            endAt: end.toISOString(),
            durationMinutes: slot.durationMin,
            weekday,
          });
        }
        current = new Date(current.getTime() + slot.durationMin * 60000);
      }
    }
  }

  return NextResponse.json({ data: available, userName: user.name });
}