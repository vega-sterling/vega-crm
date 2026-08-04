export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const form = await prisma.leadForm.findUnique({
    where: { id },
    include: { submissions: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!form) return errorResponse('Form not found', 404);
  return NextResponse.json({ data: form });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const body = await req.json();
  const form = await prisma.leadForm.update({
    where: { id },
    data: {
      name: body.name,
      fields: body.fields,
      redirectUrl: body.redirectUrl || null,
      webhookUrl: body.webhookUrl || null,
      isActive: body.isActive,
    },
  });
  return NextResponse.json({ data: form });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  await prisma.leadForm.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}