// ============================================================================
// PUT, DELETE /api/custom-properties/[id] — Vega CRM
// ============================================================================
// Update or delete a single custom property within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CustomFieldType = z.enum(['TEXT', 'NUMBER', 'DROPDOWN', 'DATE', 'BOOLEAN']);

const DropdownOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const CustomPropertyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).regex(/^[a-z0-9_]+$/, {
    message: 'Name must be lowercase letters, numbers, and underscores',
  }).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  fieldType: CustomFieldType.optional(),
  options: z.array(DropdownOptionSchema).optional().nullable(),
  defaultValue: z.string().optional().nullable(),
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedProperty(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const property = await prisma.customProperty.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      _count: { select: { values: true } },
    },
  });

  if (!property) return null;
  if (tenantIds && !tenantIds.includes(property.tenantId)) return null;
  return property;
}

/**
 * PUT /api/custom-properties/[id]
 *
 * @param req - JSON body with updated custom property fields
 * @returns Updated custom property record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const property = await getAllowedProperty(id, session);
  if (!property) return errorResponse('Custom property not found', 404);

  const body = await validateBody(req, CustomPropertyUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updateData: Record<string, unknown> = {};

  if (cleaned.name !== undefined) updateData.key = cleaned.name;
  if (cleaned.label !== undefined) updateData.label = cleaned.label;
  if (cleaned.fieldType !== undefined) updateData.fieldType = cleaned.fieldType.toLowerCase();
  if (cleaned.options !== undefined) {
    updateData.options = cleaned.options === null ? [] : cleaned.options.map((o) => o.value);
  }
  if (cleaned.defaultValue !== undefined) updateData.defaultValue = cleaned.defaultValue;
  if (cleaned.isRequired !== undefined) updateData.isRequired = cleaned.isRequired;
  if (cleaned.isVisible !== undefined) updateData.isVisible = cleaned.isVisible;
  if (cleaned.position !== undefined) updateData.position = cleaned.position;

  try {
    const updated = await prisma.customProperty.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return errorResponse('Custom property name already exists for this tenant', 409);
    }
    throw error;
  }
}

/**
 * DELETE /api/custom-properties/[id]
 *
 * Hard-deletes the custom property. Related values are removed by cascade.
 *
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const property = await getAllowedProperty(id, session);
  if (!property) return errorResponse('Custom property not found', 404);

  await prisma.customProperty.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
