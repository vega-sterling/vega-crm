// ============================================================================
// PATCH /api/email/messages/[id] — Vega CRM
// ============================================================================
// Updates an email message (currently used for marking as read).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';

/**
 * PATCH /api/email/messages/[id]
 * Body: { isRead?: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const body = await req.json();

  const email = await prisma.emailMessage.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  });

  if (!email) return errorResponse('Email not found', 404);

  const updateData: Record<string, unknown> = {};
  if (typeof body.isRead === 'boolean') updateData.isRead = body.isRead;

  if (Object.keys(updateData).length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  const updated = await prisma.emailMessage.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ data: updated });
}