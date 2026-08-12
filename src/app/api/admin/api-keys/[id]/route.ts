// ============================================================================
// File: src/app/api/admin/api-keys/[id]/route.ts
// Description: DELETE endpoint for permanently deleting an API key.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { logAudit } from '@/lib/audit';

/**
 * DELETE /api/admin/api-keys/[id]
 * Permanently deletes an API key.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) return errorResponse('API key not found', 404);

  // Check tenant access
  const isSuperAdmin = session.globalRole === 'SUPER_ADMIN';
  if (!isSuperAdmin && existing.tenantId) {
    const accessibleIds = await getAccessibleTenantIds(session);
    if (accessibleIds && !accessibleIds.includes(existing.tenantId)) {
      return errorResponse('You do not have access to this key', 403);
    }
  }

  await prisma.apiKey.delete({ where: { id } });

  // Audit log
  await logAudit({
    userId: session.userId!,
    action: 'delete',
    entity: 'api_key',
    entityId: id,
    changes: { name: existing.name, keyPrefix: existing.keyPrefix },
    req,
  });

  return NextResponse.json({ success: true });
}