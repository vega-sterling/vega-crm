// ============================================================================
// GET, PUT, DELETE /api/companies/[id] — Vega CRM
// ============================================================================
// Read, update, or soft-deactivate a single company within a tenant the
// user is allowed to access.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CompanyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedCompany(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      _count: { select: { contacts: true } },
    },
  });

  if (!company) return null;
  if (tenantIds && !tenantIds.includes(company.tenantId)) return null;
  return company;
}

/**
 * GET /api/companies/[id]
 *
 * @returns Single company details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const company = await getAllowedCompany(id, session);
  if (!company) return errorResponse('Company not found', 404);

  return NextResponse.json(company);
}

/**
 * PUT /api/companies/[id]
 *
 * @param req - JSON body with updated company fields
 * @returns Updated company record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const company = await getAllowedCompany(id, session);
  if (!company) return errorResponse('Company not found', 404);

  const body = await validateBody(req, CompanyUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updated = await prisma.company.update({
    where: { id },
    data: cleaned,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/companies/[id]
 *
 * Soft-deactivates the company instead of a hard delete.
 *
 * @returns Deactivated company record
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const company = await getAllowedCompany(id, session);
  if (!company) return errorResponse('Company not found', 404);

  const updated = await prisma.company.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json(updated);
}
