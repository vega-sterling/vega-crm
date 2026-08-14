// ============================================================================
// GET, POST /api/custom-properties — Vega CRM
// ============================================================================
// List custom field definitions for the user's accessible tenants, optionally
// filtered by entity type. Create a new custom property.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CustomEntityType = z.enum(['COMPANY', 'CONTACT']);
const CustomFieldType = z.enum(['TEXT', 'NUMBER', 'DROPDOWN', 'DATE', 'BOOLEAN']);

const DropdownOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const CustomPropertyCreateSchema = z.object({
  tenantId: z.cuid(),
  name: z.string().trim().min(1).max(120).regex(/^[a-z0-9_]+$/, {
    message: 'Name must be lowercase letters, numbers, and underscores',
  }),
  label: z.string().trim().min(1).max(120),
  entityType: CustomEntityType,
  fieldType: CustomFieldType,
  options: z.array(DropdownOptionSchema).optional(),
  defaultValue: z.string().optional().nullable(),
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
});

function entityTypeToSchemaEntity(entityType: 'COMPANY' | 'CONTACT'): string {
  return entityType.toLowerCase();
}

/**
 * GET /api/custom-properties
 *
 * @query tenantId - restrict to tenant
 * @query entityType - COMPANY | CONTACT
 * @returns Custom property definitions
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const entityType = searchParams.get('entityType')?.toUpperCase();

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }

  if (entityType === 'COMPANY' || entityType === 'CONTACT') {
    where.entity = entityTypeToSchemaEntity(entityType);
  }

  const data = await prisma.customProperty.findMany({
    where,
    orderBy: { position: 'asc' },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      _count: { select: { values: true } },
    },
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/custom-properties
 *
 * @param req - JSON body validated by CustomPropertyCreateSchema
 * @returns Created custom property record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, CustomPropertyCreateSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const existingCount = await prisma.customProperty.count({
    where: { tenantId: body.tenantId },
  });

  try {
    const property = await prisma.customProperty.create({
      data: {
        tenantId: body.tenantId,
        entity: entityTypeToSchemaEntity(body.entityType),
        key: body.name,
        label: body.label,
        fieldType: body.fieldType.toLowerCase(),
        options: body.options?.map((o) => o.value) ?? [],
        defaultValue: body.defaultValue ?? null,
        isRequired: body.isRequired ?? false,
        isVisible: body.isVisible ?? true,
        position: existingCount,
      },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return errorResponse('Custom property name already exists for this tenant', 409);
    }
    throw error;
  }
}
