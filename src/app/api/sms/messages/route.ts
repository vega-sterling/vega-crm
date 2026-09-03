// ============================================================================
// GET /api/sms/messages — Vega CRM
// ============================================================================
// Lists SMS messages. Supports filtering by contactId or no filter
// (universal inbox mode — returns all SMS for accessible tenants).
// Paginated and ordered by most recent first. Mirrors the tenant scoping
// of GET /api/email/messages exactly.
//
// NOTE: SmsMessage has no Prisma relation to Contact (only contactId), so
// the contact is resolved with a follow-up query and attached manually.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, getAccessibleTenantIds, errorResponse } from "@/lib/session";

/**
 * GET /api/sms/messages
 *
 * @query contactId - filter to a specific contact (tenant access verified)
 * @query page - page number (default 1)
 * @query limit - page size (default 50, max 100)
 * @returns Paginated SmsMessage records, newest first
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) {
    return NextResponse.json({ data: [], pagination: { page: 1, limit: 50, total: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const contactId = searchParams.get("contactId");

  const where: Record<string, unknown> = {
    tenantId: tenantIds ? { in: tenantIds } : undefined,
  };

  if (contactId) where.contactId = contactId;

  // Verify access for the contact filter
  if (contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { tenantId: true },
    });
    if (!contact || (tenantIds && !tenantIds.includes(contact.tenantId))) {
      return errorResponse("Contact not found", 404);
    }
  }

  const [rows, total] = await Promise.all([
    prisma.smsMessage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.smsMessage.count({ where }),
  ]);

  // Attach contact summaries in one query (SmsMessage has no contact relation).
  const contactIds = Array.from(
    new Set(rows.map((r) => r.contactId).filter((id): id is string => Boolean(id)))
  );
  const contacts = contactIds.length
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })
    : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const data = rows.map((row) => {
    const contact = row.contactId ? contactById.get(row.contactId) ?? null : null;
    return {
      ...row,
      contact,
    };
  });

  return NextResponse.json({
    data,
    pagination: { page, limit, total },
  });
}