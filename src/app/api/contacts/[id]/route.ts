// ============================================================================
// GET, PUT, DELETE /api/contacts/[id] — Vega CRM
// ============================================================================
// Read, update, or soft-delete a single contact within an accessible tenant.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const ContactUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getAllowedContact(
  id: string,
  session: Awaited<ReturnType<typeof requireSession>>
) {
  if (session instanceof NextResponse) return null;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return null;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true, tenantId: true } } },
  });
  if (!contact) return null;
  if (tenantIds && !tenantIds.includes(contact.tenantId)) return null;
  return contact;
}

/**
 * GET /api/contacts/[id]
 *
 * @returns Single contact details
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const contact = await getAllowedContact(id, session);
  if (!contact) return errorResponse('Contact not found', 404);

  return NextResponse.json(contact);
}

/**
 * PUT /api/contacts/[id]
 *
 * @param req - JSON body with updated contact fields
 * @returns Updated contact record
 */
export async function PUT(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const contact = await getAllowedContact(id, session);
  if (!contact) return errorResponse('Contact not found', 404);

  const body = await validateBody(req, ContactUpdateSchema);
  if (body instanceof NextResponse) return body;

  const cleaned = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, value === '' ? null : value])
  ) as Partial<typeof body>;

  const updated = await prisma.contact.update({
    where: { id },
    data: cleaned,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/contacts/[id]
 *
 * Soft-deletes a contact by setting isActive to false.
 *
 * @returns Deactivated contact record
 */
export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const contact = await getAllowedContact(id, session);
  if (!contact) return errorResponse('Contact not found', 404);

  const updated = await prisma.contact.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json(updated);
}
