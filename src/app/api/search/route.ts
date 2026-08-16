// ============================================================================
// GET /api/search — Unified server-side search across companies, contacts,
// deals, and tasks. Returns grouped, limited results for the GlobalSearch
// header component. Replaces the old client-side approach that fetched
// entire contact/deal lists and filtered in the browser.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds } from '@/lib/session';

const MAX_PER_TYPE = 8;

/**
 * GET /api/search?q=<query>
 *
 * Searches across companies (name, industry, website, email),
 * contacts (firstName, lastName, email, phone), deals (title), and
 * tasks (title). Returns grouped results with at most MAX_PER_TYPE
 * per group.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const tenantIds = await getAccessibleTenantIds(session);
  const tenantFilter = tenantIds ? { in: tenantIds } : undefined;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return NextResponse.json({
      companies: [],
      contacts: [],
      deals: [],
      tasks: [],
    });
  }

  const tenantWhere = tenantIds ? { tenantId: { in: tenantIds } } : {};

  // Run all searches in parallel
  const [companies, contacts, deals, tasks] = await Promise.all([
    // Companies: search name, industry, website, email
    prisma.company.findMany({
      where: {
        ...tenantWhere,
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { industry: { contains: q, mode: 'insensitive' } },
          { website: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        industry: true,
        website: true,
      },
      take: MAX_PER_TYPE,
      orderBy: { name: 'asc' },
    }).catch(() => []),

    // Contacts: search firstName, lastName, email, phone
    prisma.contact.findMany({
      where: {
        ...tenantWhere,
        isActive: true,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        company: { select: { id: true, name: true } },
      },
      take: MAX_PER_TYPE,
      orderBy: { lastName: 'asc' },
    }).catch(() => []),

    // Deals: search title, also match company name via relation
    prisma.deal.findMany({
      where: {
        ...tenantWhere,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        title: true,
        value: true,
        status: true,
        company: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, color: true } },
      },
      take: MAX_PER_TYPE,
      orderBy: { updatedAt: 'desc' },
    }).catch(() => []),

    // Tasks: search title, also match company name via relation
    prisma.task.findMany({
      where: {
        ...tenantWhere,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { company: { name: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        company: { select: { id: true, name: true } },
      },
      take: MAX_PER_TYPE,
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
  ]);

  return NextResponse.json({
    companies: companies.map((c) => ({
      id: c.id,
      label: c.name,
      sublabel: c.industry || c.website || undefined,
      href: `/companies/${c.id}`,
    })),
    contacts: contacts.map((c) => ({
      id: c.id,
      label: `${c.firstName} ${c.lastName}`,
      sublabel: c.company?.name || c.email || c.title || undefined,
      href: `/contacts/${c.id}`,
    })),
    deals: deals.map((d) => ({
      id: d.id,
      label: d.title,
      sublabel: d.company?.name || (d.value ? `$${d.value.toLocaleString()}` : undefined),
      href: `/deals/${d.id}`,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      label: t.title,
      sublabel: t.company?.name || t.status.replace('_', ' ') || undefined,
      href: `/tasks`,
    })),
    counts: {
      companies: companies.length,
      contacts: contacts.length,
      deals: deals.length,
      tasks: tasks.length,
      total: companies.length + contacts.length + deals.length + tasks.length,
    },
  });
}