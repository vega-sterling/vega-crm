// ============================================================================
// GET, POST /api/quotes — Vega CRM Quotes & Proposals
// ============================================================================
// List quotes for accessible tenants with optional deal filter; create a quote.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const QuoteStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']);

const QuoteLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0),
  unitPrice: z.number().min(0),
});

const QuoteCreateSchema = z.object({
  dealId: z.cuid(),
  tenantId: z.cuid(),
  notes: z.string().max(5000).optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  lineItems: z.array(QuoteLineItemSchema).min(1),
});

async function canAccessDeal(
  session: Awaited<ReturnType<typeof requireSession>>,
  dealId: string
): Promise<boolean> {
  if (session instanceof NextResponse) return false;
  if (session.globalRole === 'SUPER_ADMIN') return true;
  const tenantIds = await getAccessibleTenantIds(session);
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { tenantId: true },
  });
  if (!deal || !tenantIds) return false;
  return tenantIds.includes(deal.tenantId);
}

function calculateTotals(lineItems: z.infer<typeof QuoteLineItemSchema>[]) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal + taxAmount;
  return { subtotal, taxRate, taxAmount, total };
}

/**
 * GET /api/quotes
 *
 * @query dealId - filter by deal
 * @query tenantId - restrict to tenant
 * @query page - page number (default 1)
 * @query limit - page size (default 25)
 * @returns Array of quotes with line items and deal info
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get('dealId');
  const tenantId = searchParams.get('tenantId');
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '25')));

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (tenantId) {
    if (tenantIds && !tenantIds.includes(tenantId)) return errorResponse('Forbidden', 403);
    where.tenantId = tenantId;
  }
  if (dealId) where.dealId = dealId;

  const [data, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        deal: { select: { id: true, title: true } },
        tenant: { select: { id: true, name: true } },
        lineItems: true,
      },
    }),
    prisma.quote.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/quotes
 *
 * Creates a new quote with line items and auto-calculated totals.
 * @param req - JSON body validated by QuoteCreateSchema
 * @returns Created quote record
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, QuoteCreateSchema);
  if (body instanceof NextResponse) return body;

  const allowedDeal = await canAccessDeal(session, body.dealId);
  if (!allowedDeal) return errorResponse('Forbidden', 403);

  const deal = await prisma.deal.findUnique({
    where: { id: body.dealId },
    select: { tenantId: true },
  });
  if (!deal) return errorResponse('Deal not found', 404);
  if (deal.tenantId !== body.tenantId) {
    return errorResponse('tenantId does not match deal', 400);
  }

  const { subtotal, taxRate, taxAmount, total } = calculateTotals(body.lineItems);

  const year = new Date().getFullYear();
  const count = await prisma.quote.count({ where: { tenantId: body.tenantId } });
  const number = `Q-${year}-${String(count + 1).padStart(3, '0')}`;

  const quote = await prisma.quote.create({
    data: {
      dealId: body.dealId,
      tenantId: body.tenantId,
      number,
      status: 'DRAFT',
      subtotal,
      taxRate,
      taxAmount,
      total,
      notes: body.notes || null,
      validUntil: body.validUntil || null,
      lineItems: {
        create: body.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      },
    },
    include: {
      deal: { select: { id: true, title: true } },
      tenant: { select: { id: true, name: true } },
      lineItems: true,
    },
  });

  return NextResponse.json(quote, { status: 201 });
}
