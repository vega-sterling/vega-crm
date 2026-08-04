// ============================================================================
// GET, PATCH, DELETE /api/quotes/[id] — Vega CRM Quotes & Proposals
// ============================================================================
// Read, update, or delete a single quote within an accessible tenant.
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

const QuoteUpdateSchema = z.object({
  status: QuoteStatusSchema.optional(),
  notes: z.string().max(5000).optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  lineItems: z.array(QuoteLineItemSchema).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedQuote(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      deal: { select: { id: true, title: true, tenantId: true } },
      tenant: { select: { id: true, name: true } },
      lineItems: true,
    },
  });
  if (!quote) return null;
  if (tenantIds && !tenantIds.includes(quote.tenantId)) return null;
  return quote;
}

function calculateTotals(lineItems: z.infer<typeof QuoteLineItemSchema>[]) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxRate = 0;
  const taxAmount = 0;
  const total = subtotal + taxAmount;
  return { subtotal, taxRate, taxAmount, total };
}

/**
 * GET /api/quotes/[id]
 *
 * @returns Single quote with line items
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const quote = await getAllowedQuote(id, session);
  if (!quote) return errorResponse('Quote not found', 404);

  return NextResponse.json(quote);
}

/**
 * PATCH /api/quotes/[id]
 *
 * Updates quote status, notes, validUntil, or replaces all line items.
 * @param req - JSON body validated by QuoteUpdateSchema
 * @returns Updated quote record
 */
export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const quote = await getAllowedQuote(id, session);
  if (!quote) return errorResponse('Quote not found', 404);

  const body = await validateBody(req, QuoteUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updateData: Record<string, unknown> = {};
  if (cleaned.status !== undefined) updateData.status = cleaned.status;
  if (cleaned.notes !== undefined) updateData.notes = cleaned.notes;
  if (cleaned.validUntil !== undefined) updateData.validUntil = cleaned.validUntil;

  if (cleaned.status === 'SENT' && !quote.sentAt) {
    updateData.sentAt = new Date();
  }
  if (cleaned.status === 'ACCEPTED' && !quote.acceptedAt) {
    updateData.acceptedAt = new Date();
  }

  let lineItemOps: Record<string, unknown> | undefined;
  if (cleaned.lineItems && cleaned.lineItems.length > 0) {
    const { subtotal, taxRate, taxAmount, total } = calculateTotals(cleaned.lineItems);
    updateData.subtotal = subtotal;
    updateData.taxRate = taxRate;
    updateData.taxAmount = taxAmount;
    updateData.total = total;
    lineItemOps = {
      deleteMany: {},
      create: cleaned.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      })),
    };
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: {
      ...updateData,
      ...(lineItemOps ? { lineItems: lineItemOps } : {}),
    },
    include: {
      deal: { select: { id: true, title: true } },
      tenant: { select: { id: true, name: true } },
      lineItems: true,
    },
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/quotes/[id]
 *
 * Hard-deletes a quote and its line items.
 * @returns Success confirmation
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const quote = await getAllowedQuote(id, session);
  if (!quote) return errorResponse('Quote not found', 404);

  await prisma.quote.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
