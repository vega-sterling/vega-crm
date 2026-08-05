// ============================================================================
// GET, POST /api/custom-values — Vega CRM
// ============================================================================
// Read and upsert custom property values for companies and contacts.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CustomEntityType = z.enum(['COMPANY', 'CONTACT']);

const CustomValueUpsertSchema = z.object({
  tenantId: z.cuid(),
  propertyId: z.cuid(),
  entityType: CustomEntityType,
  entityId: z.cuid(),
  value: z.string().optional().nullable(),
});

const CustomValueQuerySchema = z.object({
  tenantId: z.cuid().optional(),
  entityType: CustomEntityType,
  entityId: z.cuid(),
});

function entityTypeToSchemaEntity(entityType: 'COMPANY' | 'CONTACT'): string {
  return entityType.toLowerCase();
}

async function canAccessEntity(
  session: Awaited<ReturnType<typeof requireSession>>,
  entityType: 'COMPANY' | 'CONTACT',
  entityId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;

  const tenantIds = await getAccessibleTenantIds(session);
  if (!tenantIds) return true;

  if (entityType === 'COMPANY') {
    const company = await prisma.company.findUnique({
      where: { id: entityId },
      select: { tenantId: true },
    });
    return !!company && tenantIds.includes(company.tenantId);
  }

  const contact = await prisma.contact.findUnique({
    where: { id: entityId },
    select: { tenantId: true },
  });
  return !!contact && tenantIds.includes(contact.tenantId);
}

/**
 * GET /api/custom-values
 *
 * @query tenantId - restrict to tenant
 * @query entityType - COMPANY | CONTACT
 * @query entityId - company or contact ID
 * @returns Custom property values with property definitions
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);

  const query = CustomValueQuerySchema.safeParse({
    tenantId: searchParams.get('tenantId') ?? undefined,
    entityType: searchParams.get('entityType')?.toUpperCase(),
    entityId: searchParams.get('entityId'),
  });

  if (!query.success) {
    return errorResponse('Invalid query parameters', 400, query.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })));
  }

  const { tenantId, entityType, entityId } = query.data;

  if (!(await canAccessEntity(session, entityType, entityId))) {
    return errorResponse('Forbidden', 403);
  }

  const tenantIds = await getAccessibleTenantIds(session);
  const where: Record<string, unknown> = {
    entityId,
    property: {
      entity: entityTypeToSchemaEntity(entityType),
      tenantId: tenantIds ? { in: tenantIds } : undefined,
    },
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    (where.property as Record<string, unknown>).tenantId = tenantId;
  }

  const values = await prisma.customPropertyValue.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          tenantId: true,
          key: true,
          label: true,
          fieldType: true,
          options: true,
          isRequired: true,
          position: true,
        },
      },
    },
    orderBy: { property: { position: 'asc' } },
  });

  return NextResponse.json({ data: values });
}

/**
 * POST /api/custom-values
 *
 * Upserts a custom property value for an entity.
 *
 * @param req - JSON body validated by CustomValueUpsertSchema
 * @returns Created or updated custom value record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, CustomValueUpsertSchema);
  if (body instanceof NextResponse) return body;

  if (!(await canAccessEntity(session, body.entityType, body.entityId))) {
    return errorResponse('Forbidden', 403);
  }

  const property = await prisma.customProperty.findUnique({
    where: { id: body.propertyId },
    select: { tenantId: true, entity: true, key: true, isRequired: true },
  });

  if (!property) return errorResponse('Custom property not found', 404);

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(property.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  if (property.tenantId !== body.tenantId) {
    return errorResponse('Property does not belong to the specified tenant', 400);
  }

  if (property.entity !== entityTypeToSchemaEntity(body.entityType)) {
    return errorResponse('Property entity type does not match target entity', 400);
  }

  if (property.isRequired && (body.value === null || body.value === undefined || body.value.trim() === '')) {
    return errorResponse(`${property.key} is required`, 422);
  }

  const existing = await prisma.customPropertyValue.findFirst({
    where: { propertyId: body.propertyId, entityId: body.entityId },
    select: { id: true },
  });

  const value = await prisma.customPropertyValue.upsert({
    where: {
      id: existing?.id ?? '__new__',
    },
    update: {
      value: body.value ?? null,
    },
    create: {
      propertyId: body.propertyId,
      entityId: body.entityId,
      value: body.value ?? null,
    },
  });

  return NextResponse.json(value, { status: 201 });
}

/**
 * PUT /api/custom-values
 *
 * Alias for upserting a custom property value.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
