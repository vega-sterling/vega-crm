// ============================================================================
// GET /api/export — Vega CRM Data Export
// ============================================================================
// Exports CRM records as CSV. Supports companies, contacts, deals, tasks,
// and activities. Admin-only — tenant-scoped for tenant admins, all data
// for super admins. Respects current search/filter query params.
//
// Query params:
//   entity   — required: "companies" | "contacts" | "deals" | "tasks" | "activities"
//   tenantId — optional: filter to specific tenant (super admin only)
//   search   — optional: search string passed through to query
//
// Returns: text/csv with Content-Disposition attachment header.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { logAudit } from '@/lib/audit';

/** CSV escape — wraps values containing commas, quotes, or newlines in double quotes. */
function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'string' ? val : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** Convert an array of objects to CSV string with headers from the first object. */
function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => csvEscape(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
}

/** Build tenant where clause from accessible tenant IDs. */
function tenantWhere(tenantIds: string[] | null, tenantId?: string | null) {
  if (tenantId) return { tenantId };
  if (tenantIds) return { tenantId: { in: tenantIds } };
  return {};
}

// ── Entity exporters ──

async function exportCompanies(
  tenantIds: string[] | null,
  tenantId?: string | null,
  search?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ...tenantWhere(tenantIds, tenantId), isActive: true };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { industry: { contains: search, mode: 'insensitive' } },
    ];
  }
  const companies = await prisma.company.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { contacts: true, deals: true, activities: true } },
    },
  });
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry || '',
    website: c.website || '',
    phone: c.phone || '',
    email: c.email || '',
    address: c.address || '',
    description: c.description || '',
    contactsCount: c._count.contacts,
    dealsCount: c._count.deals,
    activitiesCount: c._count.activities,
    createdAt: c.createdAt.toISOString(),
  }));
}

async function exportContacts(
  tenantIds: string[] | null,
  tenantId?: string | null,
  search?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ...tenantWhere(tenantIds, tenantId), isActive: true };
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { lastName: 'asc' },
    include: {
      company: { select: { id: true, name: true } },
    },
  });
  return contacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: `${c.firstName} ${c.lastName}`,
    email: c.email || '',
    phone: c.phone || '',
    mobile: c.mobile || '',
    title: c.title || '',
    department: c.department || '',
    company: c.company?.name || '',
    companyId: c.companyId,
    tags: Array.isArray(c.tags) ? c.tags.join(';') : '',
    notes: c.notes || '',
    createdAt: c.createdAt.toISOString(),
  }));
}

async function exportDeals(
  tenantIds: string[] | null,
  tenantId?: string | null,
  search?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ...tenantWhere(tenantIds, tenantId) };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { company: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  return deals.map((d) => ({
    id: d.id,
    title: d.title,
    value: d.value,
    currency: d.currency,
    probability: d.probability,
    status: d.status,
    stage: d.stage?.name || '',
    stageId: d.stageId,
    company: d.company?.name || '',
    companyId: d.companyId,
    contact: d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : '',
    contactId: d.contactId || '',
    assignee: d.assignee?.name || '',
    assignedToId: d.assignedToId,
    expectedCloseDate: d.expectedCloseDate?.toISOString() || '',
    actualCloseDate: d.actualCloseDate?.toISOString() || '',
    lossReason: d.lossReason || '',
    leadSource: d.leadSource || '',
    createdAt: d.createdAt.toISOString(),
  }));
}

async function exportTasks(
  tenantIds: string[] | null,
  tenantId?: string | null,
  search?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ...tenantWhere(tenantIds, tenantId) };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { company: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    company: t.company?.name || '',
    companyId: t.companyId,
    contact: t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : '',
    contactId: t.contactId || '',
    assignee: t.assignee?.name || '',
    assignedToId: t.assignedToId,
    dueDate: t.dueDate?.toISOString() || '',
    completedAt: t.completedAt?.toISOString() || '',
    createdAt: t.createdAt.toISOString(),
  }));
}

async function exportActivities(
  tenantIds: string[] | null,
  tenantId?: string | null,
  search?: string
): Promise<Record<string, unknown>[]> {
  const where: Record<string, unknown> = { ...tenantWhere(tenantIds, tenantId) };
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  const activities = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { id: true, name: true } },
    },
  });
  return activities.map((a) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    description: a.description || '',
    company: a.company?.name || '',
    companyId: a.companyId,
    contact: a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : '',
    contactId: a.contactId || '',
    user: a.user?.name || '',
    callDirection: a.callDirection || '',
    callDuration: a.callDuration || '',
    callOutcome: a.callOutcome || '',
    scheduledAt: a.scheduledAt?.toISOString() || '',
    completedAt: a.completedAt?.toISOString() || '',
    createdAt: a.createdAt.toISOString(),
  }));
}

// ── Route handler ──

const VALID_ENTITIES = ['companies', 'contacts', 'deals', 'tasks', 'activities'] as const;
type EntityType = (typeof VALID_ENTITIES)[number];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity') as EntityType | null;
  const tenantIdParam = searchParams.get('tenantId');
  const search = searchParams.get('search')?.trim() || undefined;

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    return errorResponse(`Invalid or missing entity. Valid options: ${VALID_ENTITIES.join(', ')}`, 400);
  }

  // Determine accessible tenant IDs
  let tenantIds: string[] | null = null;
  if (admin.globalRole !== 'SUPER_ADMIN') {
    tenantIds = await getAccessibleTenantIds(admin);
    if (!tenantIds || tenantIds.length === 0) {
      return NextResponse.json({ error: 'No accessible tenants' }, { status: 403 });
    }
  }

  // Only super admins can filter by a specific tenant different from their own
  const tenantId =
    admin.globalRole === 'SUPER_ADMIN' ? tenantIdParam || undefined : undefined;

  let rows: Record<string, unknown>[] = [];
  switch (entity) {
    case 'companies':
      rows = await exportCompanies(tenantIds, tenantId, search);
      break;
    case 'contacts':
      rows = await exportContacts(tenantIds, tenantId, search);
      break;
    case 'deals':
      rows = await exportDeals(tenantIds, tenantId, search);
      break;
    case 'tasks':
      rows = await exportTasks(tenantIds, tenantId, search);
      break;
    case 'activities':
      rows = await exportActivities(tenantIds, tenantId, search);
      break;
  }

  const csv = toCSV(rows);
  const filename = `${entity}-export-${new Date().toISOString().slice(0, 10)}.csv`;

  // Audit log
  await logAudit({
    userId: admin.userId!,
    action: 'export',
    entity: entity === 'companies' ? 'company' : entity === 'contacts' ? 'contact' : entity === 'activities' ? 'activity' : entity.slice(0, -1),
    entityId: filename,
    changes: { count: rows.length, entity },
    req,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}