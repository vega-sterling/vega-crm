// ============================================================================
// File: src/app/api/v1/contacts/[id]/route.ts
// Description: Public API v1 endpoint for a single contact — authenticated
//   via x-api-key header (not session cookie). Requires scope: read:contacts.
//   Follows the exact pattern of /api/v1/companies.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/apiKeyAuth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/contacts/[id]
 * Returns a single contact accessible to the API key.
 * Requires scope: read:contacts
 */
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const ctx = await authenticateApiKey(req, 'read:contacts');
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await context.params;

  // Typed for Prisma findUnique (extended where unique): id plus tenant filter
  const where: { id: string; tenantId?: string } = { id };
  if (ctx.tenantId) {
    where.tenantId = ctx.tenantId;
  } else if (!ctx.isSuperAdminKey) {
    // Non-super-admin keys with null tenantId should see nothing
    // (they were created by tenant admins, not super admins)
    // This is a safety check — the key should have a tenantId
    where.tenantId = '__none__';
  }

  const contact = await prisma.contact.findUnique({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobile: true,
      title: true,
      department: true,
      notes: true,
      tags: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, name: true } },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  return NextResponse.json(contact);
}