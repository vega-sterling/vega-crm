// ============================================================================
// PUT, DELETE /api/email/templates/[id] — Vega CRM
// ============================================================================
// Update or delete a single email template within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const EmailTemplateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedTemplate(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const template = await prisma.emailTemplate.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { steps: true } },
    },
  });

  if (!template) return null;
  if (tenantIds && !tenantIds.includes(template.tenantId)) return null;
  return template;
}

/**
 * PUT /api/email/templates/[id]
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const template = await getAllowedTemplate(id, session);
  if (!template) return errorResponse('Template not found', 404);

  const body = await validateBody(req, EmailTemplateUpdateSchema);
  if (body instanceof NextResponse) return body;

  const updated = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: body.name,
      subject: body.subject,
      body: body.body,
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/email/templates/[id]
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const template = await getAllowedTemplate(id, session);
  if (!template) return errorResponse('Template not found', 404);

  if (template._count.steps > 0) {
    return errorResponse('Cannot delete template used in a sequence', 409);
  }

  await prisma.emailTemplate.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
