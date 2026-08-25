// ============================================================================
// File: src/app/api/bookings/slots/[id]/route.ts
// DELETE /api/bookings/slots/:id — delete a booking slot config
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const slot = await prisma.bookingSlot.findUnique({ where: { id } });
  if (!slot) return errorResponse('Booking slot not found', 404);

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(slot.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  await prisma.bookingSlot.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}