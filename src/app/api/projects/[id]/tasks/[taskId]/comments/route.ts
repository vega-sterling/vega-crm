// ============================================================================
// GET, POST /api/projects/[id]/tasks/[taskId]/comments — Vega CRM
// ============================================================================
// List and create activity-history comments on a project task card.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CommentCreateSchema = z.object({
  body: z.string().min(1),
});

/**
 * GET /api/projects/[id]/tasks/[taskId]/comments
 *
 * @returns Comments for a project task, newest first
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { taskId } = await params;

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: comments });
}

/**
 * POST /api/projects/[id]/tasks/[taskId]/comments
 *
 * @param req - JSON body: { body: string }
 * @returns Created comment
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { taskId } = await params;
  const data = await validateBody(req, CommentCreateSchema);
  if (data instanceof NextResponse) return data;

  // Verify the task exists and get tenantId
  const task = await prisma.projectTask.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true },
  });
  if (!task) return errorResponse('Task not found', 404);

  const comment = await prisma.taskComment.create({
    data: {
      taskId,
      tenantId: task.tenantId,
      userId: session.userId!,
      body: data.body,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(comment, { status: 201 });
}