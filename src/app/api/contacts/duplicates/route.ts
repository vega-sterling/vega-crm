// ============================================================================
// GET /api/contacts/duplicates — Vega CRM Duplicate Detection (Phase 39)
// ============================================================================
// Read-only scan across accessible tenants. Groups exact email matches
// (case-insensitive, non-null) as type 'email', and same first+last name
// (case-insensitive, trimmed) + same companyId as type 'name'.
// Returns { data: [{ type, contacts }] } — groups of 2+, email groups first,
// capped at 50 groups. Archived contacts are included (UI shows a badge).
// Additive, read-only, no schema changes.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds } from '@/lib/session';

const MAX_GROUPS = 50;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);

  const contacts = await prisma.contact.findMany({
    where: tenantIds ? { tenantId: { in: tenantIds } } : {},
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobile: true,
      title: true,
      department: true,
      isActive: true,
      createdAt: true,
      company: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  type ContactRow = (typeof contacts)[number];

  const groups: Array<{ type: 'email' | 'name'; contacts: ContactRow[] }> = [];
  const emailGroupIdSets = new Set<string>();

  // ── 1. Exact email matches (case-insensitive, non-null) ──
  const byEmail = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const email = (c.email || '').trim().toLowerCase();
    if (!email) continue;
    const arr = byEmail.get(email);
    if (arr) arr.push(c);
    else byEmail.set(email, [c]);
  }
  for (const arr of byEmail.values()) {
    if (arr.length < 2) continue;
    emailGroupIdSets.add(arr.map((c) => c.id).sort().join('|'));
    groups.push({ type: 'email', contacts: arr });
  }

  // ── 2. Same first+last name (case-insensitive, trimmed) + same company ──
  const byName = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const key = `${c.firstName.trim().toLowerCase()}\u0000${c.lastName.trim().toLowerCase()}\u0000${c.companyId}`;
    const arr = byName.get(key);
    if (arr) arr.push(c);
    else byName.set(key, [c]);
  }
  for (const arr of byName.values()) {
    if (arr.length < 2) continue;
    // Skip if this exact pair/set is already reported as an email match
    const idKey = arr.map((c) => c.id).sort().join('|');
    if (emailGroupIdSets.has(idKey)) continue;
    groups.push({ type: 'name', contacts: arr });
  }

  return NextResponse.json({ data: groups.slice(0, MAX_GROUPS) });
}