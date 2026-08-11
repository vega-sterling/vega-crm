// ============================================================================
// POST /api/import — Vega CRM Data Import
// ============================================================================
// Imports CRM records from CSV data. Admin-only. Supports companies,
// contacts, deals, tasks, and activities.
//
// Request body:
//   entity     — "companies" | "contacts" | "deals" | "tasks" | "activities"
//   csvData    — raw CSV string (the file contents)
//   mappings   — { [csvColumnName]: crmFieldName | "__skip" }
//   tenantId   — target tenant for new records
//   duplicateMode — "create" | "skip" | "update"
//   duplicateKey  — field name used for dedup (e.g., "email" for contacts)
//
// Returns: JSON { created, updated, skipped, failed, errors: [...] }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAdmin, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { logAudit } from '@/lib/audit';

// ── CSV parser ──

/** Parse a CSV string into rows of objects keyed by header. Handles quoted fields. */
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  // Normalize line endings and parse, respecting quoted fields
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  if (lines.length === 0) return [];

  // Parse header
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields.map((f) => f.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  };

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }

  return rows;
}

// ── Entity field definitions ──

interface FieldDef {
  name: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date' | 'enum' | 'array';
  enumValues?: string[];
  description?: string;
}

const COMPANY_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Company Name', required: true, type: 'string' },
  { name: 'industry', label: 'Industry', required: false, type: 'string' },
  { name: 'website', label: 'Website', required: false, type: 'string' },
  { name: 'phone', label: 'Phone', required: false, type: 'string' },
  { name: 'email', label: 'Email', required: false, type: 'string' },
  { name: 'address', label: 'Address', required: false, type: 'string' },
  { name: 'description', label: 'Description', required: false, type: 'string' },
];

const CONTACT_FIELDS: FieldDef[] = [
  { name: 'firstName', label: 'First Name', required: true, type: 'string' },
  { name: 'lastName', label: 'Last Name', required: true, type: 'string' },
  { name: 'email', label: 'Email', required: false, type: 'string' },
  { name: 'phone', label: 'Phone', required: false, type: 'string' },
  { name: 'mobile', label: 'Mobile', required: false, type: 'string' },
  { name: 'title', label: 'Job Title', required: false, type: 'string' },
  { name: 'department', label: 'Department', required: false, type: 'string' },
  { name: 'companyName', label: 'Company Name (for linking)', required: true, type: 'string', description: 'Matches existing company by name. If no match, record will fail.' },
  { name: 'tags', label: 'Tags (semicolon-separated)', required: false, type: 'array' },
  { name: 'notes', label: 'Notes', required: false, type: 'string' },
];

const DEAL_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Deal Title', required: true, type: 'string' },
  { name: 'value', label: 'Value (USD)', required: false, type: 'number' },
  { name: 'currency', label: 'Currency', required: false, type: 'string' },
  { name: 'probability', label: 'Probability (0-100)', required: false, type: 'number' },
  { name: 'companyName', label: 'Company Name (for linking)', required: true, type: 'string' },
  { name: 'contactEmail', label: 'Contact Email (optional, for linking)', required: false, type: 'string' },
  { name: 'stageName', label: 'Pipeline Stage Name', required: false, type: 'string' },
  { name: 'leadSource', label: 'Lead Source', required: false, type: 'string' },
  { name: 'expectedCloseDate', label: 'Expected Close Date (YYYY-MM-DD)', required: false, type: 'date' },
];

const TASK_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Task Title', required: true, type: 'string' },
  { name: 'description', label: 'Description', required: false, type: 'string' },
  { name: 'status', label: 'Status', required: false, type: 'enum', enumValues: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
  { name: 'priority', label: 'Priority', required: false, type: 'enum', enumValues: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
  { name: 'companyName', label: 'Company Name (for linking)', required: true, type: 'string' },
  { name: 'dueDate', label: 'Due Date (YYYY-MM-DD)', required: false, type: 'date' },
];

const ACTIVITY_FIELDS: FieldDef[] = [
  { name: 'type', label: 'Type', required: true, type: 'enum', enumValues: ['CALL', 'EMAIL', 'NOTE', 'MEETING'] },
  { name: 'subject', label: 'Subject', required: true, type: 'string' },
  { name: 'description', label: 'Description', required: false, type: 'string' },
  { name: 'companyName', label: 'Company Name (for linking)', required: true, type: 'string' },
  { name: 'callDirection', label: 'Call Direction', required: false, type: 'string' },
  { name: 'callOutcome', label: 'Call Outcome', required: false, type: 'string' },
];

const ENTITY_FIELDS: Record<string, FieldDef[]> = {
  companies: COMPANY_FIELDS,
  contacts: CONTACT_FIELDS,
  deals: DEAL_FIELDS,
  tasks: TASK_FIELDS,
  activities: ACTIVITY_FIELDS,
};

const VALID_ENTITIES = Object.keys(ENTITY_FIELDS);

// ── Zod validation ──

const ImportSchema = z.object({
  entity: z.enum(VALID_ENTITIES as [string, ...string[]]),
  csvData: z.string().min(1, 'CSV data is required'),
  mappings: z.record(z.string(), z.string()),
  tenantId: z.string().min(1, 'Tenant ID is required'),
  duplicateMode: z.enum(['create', 'skip', 'update']).default('create'),
  duplicateKey: z.string().optional(),
});

// ── Import processors ──

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

/** Validate and coerce a field value based on its type definition. */
function coerceValue(value: string, field: FieldDef): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    if (field.required) return { ok: false, error: `${field.label} is required` };
    return { ok: true, value: null };
  }
  switch (field.type) {
    case 'number': {
      const n = Number(trimmed);
      if (isNaN(n)) return { ok: false, error: `${field.label} must be a number, got "${trimmed}"` };
      return { ok: true, value: n };
    }
    case 'date': {
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return { ok: false, error: `${field.label} is not a valid date: "${trimmed}"` };
      return { ok: true, value: d };
    }
    case 'enum': {
      if (field.enumValues && !field.enumValues.includes(trimmed.toUpperCase())) {
        return { ok: false, error: `${field.label} must be one of: ${field.enumValues.join(', ')}` };
      }
      return { ok: true, value: trimmed.toUpperCase() };
    }
    case 'array':
      return { ok: true, value: trimmed.split(';').map((s) => s.trim()).filter(Boolean) };
    default:
      return { ok: true, value: trimmed };
  }
}

/** Extract mapped field value from a CSV row. */
function getMappedValue(row: Record<string, string>, csvCol: string, mappings: Record<string, string>): string {
  return row[csvCol] || '';
}

/** Build the data object from a CSV row using the mappings. */
function buildRecord(
  row: Record<string, string>,
  mappings: Record<string, string>,
  fields: FieldDef[]
): { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];

  // Build reverse mapping: crmField -> csvCol
  const reverseMap: Record<string, string> = {};
  for (const [csvCol, crmField] of Object.entries(mappings)) {
    if (crmField && crmField !== '__skip') {
      reverseMap[crmField] = csvCol;
    }
  }

  for (const field of fields) {
    const csvCol = reverseMap[field.name];
    if (!csvCol) {
      if (field.required) {
        errors.push(`${field.label} is required but not mapped`);
      }
      continue;
    }
    const rawValue = getMappedValue(row, csvCol, mappings);
    const result = coerceValue(rawValue, field);
    if (result.ok) {
      data[field.name] = result.value;
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

// ── Entity-specific import logic ──

async function importCompanies(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  tenantId: string,
  userId: string,
  duplicateMode: string,
  duplicateKey: string | undefined,
  req: NextRequest
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const fields = COMPANY_FIELDS;

  for (let i = 0; i < rows.length; i++) {
    const built = buildRecord(rows[i], mappings, fields);
    if (!built.ok) {
      result.failed++;
      result.errors.push({ row: i + 2, message: built.errors.join('; ') });
      continue;
    }
    const data = built.data;

    try {
      // Check for duplicates
      if (duplicateMode !== 'create' && duplicateKey && data[duplicateKey]) {
        const existing = await prisma.company.findFirst({
          where: { tenantId, [duplicateKey]: data[duplicateKey], isActive: true },
        });
        if (existing) {
          if (duplicateMode === 'skip') {
            result.skipped++;
            continue;
          }
          if (duplicateMode === 'update') {
            const { name, industry, website, phone, email, address, description } = data as Record<string, string>;
            await prisma.company.update({
              where: { id: existing.id },
              data: {
                ...(name && { name: name as string }),
                ...(industry !== undefined && { industry: industry as string }),
                ...(website !== undefined && { website: website as string }),
                ...(phone !== undefined && { phone: phone as string }),
                ...(email !== undefined && { email: email as string }),
                ...(address !== undefined && { address: address as string }),
                ...(description !== undefined && { description: description as string }),
              },
            });
            result.updated++;
            continue;
          }
        }
      }

      await prisma.company.create({
        data: {
          tenantId,
          name: data.name as string,
          industry: (data.industry as string) || null,
          website: (data.website as string) || null,
          phone: (data.phone as string) || null,
          email: (data.email as string) || null,
          address: (data.address as string) || null,
          description: (data.description as string) || null,
          isActive: true,
        },
      });
      result.created++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: i + 2, message: err.message || 'Database error' });
    }
  }

  return result;
}

async function importContacts(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  tenantId: string,
  userId: string,
  duplicateMode: string,
  duplicateKey: string | undefined,
  req: NextRequest
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const fields = CONTACT_FIELDS;

  for (let i = 0; i < rows.length; i++) {
    const built = buildRecord(rows[i], mappings, fields);
    if (!built.ok) {
      result.failed++;
      result.errors.push({ row: i + 2, message: built.errors.join('; ') });
      continue;
    }
    const data = built.data;
    const companyName = data.companyName as string;

    try {
      // Find company by name within tenant
      const company = await prisma.company.findFirst({
        where: { tenantId, name: { equals: companyName, mode: 'insensitive' }, isActive: true },
      });
      if (!company) {
        result.failed++;
        result.errors.push({ row: i + 2, message: `Company "${companyName}" not found in tenant` });
        continue;
      }

      // Check for duplicates
      if (duplicateMode !== 'create' && duplicateKey && data[duplicateKey]) {
        const existing = await prisma.contact.findFirst({
          where: { tenantId, [duplicateKey]: data[duplicateKey], isActive: true },
        });
        if (existing) {
          if (duplicateMode === 'skip') {
            result.skipped++;
            continue;
          }
          if (duplicateMode === 'update') {
            const { firstName, lastName, email, phone, mobile, title, department, notes, tags } = data as Record<string, any>;
            await prisma.contact.update({
              where: { id: existing.id },
              data: {
                ...(firstName && { firstName: firstName as string }),
                ...(lastName && { lastName: lastName as string }),
                ...(email !== undefined && { email: email as string }),
                ...(phone !== undefined && { phone: phone as string }),
                ...(mobile !== undefined && { mobile: mobile as string }),
                ...(title !== undefined && { title: title as string }),
                ...(department !== undefined && { department: department as string }),
                ...(notes !== undefined && { notes: notes as string }),
                ...(tags && { tags: tags as string[] }),
              },
            });
            result.updated++;
            continue;
          }
        }
      }

      await prisma.contact.create({
        data: {
          tenantId,
          companyId: company.id,
          firstName: data.firstName as string,
          lastName: data.lastName as string,
          email: (data.email as string) || null,
          phone: (data.phone as string) || null,
          mobile: (data.mobile as string) || null,
          title: (data.title as string) || null,
          department: (data.department as string) || null,
          notes: (data.notes as string) || null,
          tags: (data.tags as string[]) || [],
          isActive: true,
        },
      });
      result.created++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: i + 2, message: err.message || 'Database error' });
    }
  }

  return result;
}

async function importDeals(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  tenantId: string,
  userId: string,
  duplicateMode: string,
  duplicateKey: string | undefined,
  req: NextRequest
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const fields = DEAL_FIELDS;

  // Get first pipeline stage as default
  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { tenantId },
    orderBy: { position: 'asc' },
  });

  for (let i = 0; i < rows.length; i++) {
    const built = buildRecord(rows[i], mappings, fields);
    if (!built.ok) {
      result.failed++;
      result.errors.push({ row: i + 2, message: built.errors.join('; ') });
      continue;
    }
    const data = built.data;
    const companyName = data.companyName as string;

    try {
      // Find company
      const company = await prisma.company.findFirst({
        where: { tenantId, name: { equals: companyName, mode: 'insensitive' }, isActive: true },
      });
      if (!company) {
        result.failed++;
        result.errors.push({ row: i + 2, message: `Company "${companyName}" not found` });
        continue;
      }

      // Find stage by name or use default
      let stageId = defaultStage?.id;
      if (data.stageName) {
        const stage = await prisma.pipelineStage.findFirst({
          where: { tenantId, name: { equals: data.stageName as string, mode: 'insensitive' } },
        });
        if (stage) stageId = stage.id;
      }
      if (!stageId) {
        result.failed++;
        result.errors.push({ row: i + 2, message: 'No pipeline stage found for tenant' });
        continue;
      }

      // Find contact by email if provided
      let contactId: string | null = null;
      if (data.contactEmail) {
        const contact = await prisma.contact.findFirst({
          where: { tenantId, email: { equals: data.contactEmail as string, mode: 'insensitive' } },
        });
        if (contact) contactId = contact.id;
      }

      await prisma.deal.create({
        data: {
          tenantId,
          title: data.title as string,
          companyId: company.id,
          contactId,
          stageId,
          value: (data.value as number) || 0,
          currency: (data.currency as string) || 'USD',
          probability: (data.probability as number) || 50,
          assignedToId: userId,
          createdById: userId,
          leadSource: (data.leadSource as string) || null,
          expectedCloseDate: (data.expectedCloseDate as Date) || null,
          status: 'OPEN',
        },
      });
      result.created++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: i + 2, message: err.message || 'Database error' });
    }
  }

  return result;
}

async function importTasks(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  tenantId: string,
  userId: string,
  duplicateMode: string,
  duplicateKey: string | undefined,
  req: NextRequest
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const fields = TASK_FIELDS;

  for (let i = 0; i < rows.length; i++) {
    const built = buildRecord(rows[i], mappings, fields);
    if (!built.ok) {
      result.failed++;
      result.errors.push({ row: i + 2, message: built.errors.join('; ') });
      continue;
    }
    const data = built.data;
    const companyName = data.companyName as string;

    try {
      const company = await prisma.company.findFirst({
        where: { tenantId, name: { equals: companyName, mode: 'insensitive' }, isActive: true },
      });
      if (!company) {
        result.failed++;
        result.errors.push({ row: i + 2, message: `Company "${companyName}" not found` });
        continue;
      }

      await prisma.task.create({
        data: {
          tenantId,
          companyId: company.id,
          title: data.title as string,
          description: (data.description as string) || null,
          status: ((data.status as string) || 'PENDING') as any,
          priority: ((data.priority as string) || 'MEDIUM') as any,
          assignedToId: userId,
          createdById: userId,
          dueDate: (data.dueDate as Date) || null,
        },
      });
      result.created++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: i + 2, message: err.message || 'Database error' });
    }
  }

  return result;
}

async function importActivities(
  rows: Record<string, string>[],
  mappings: Record<string, string>,
  tenantId: string,
  userId: string,
  duplicateMode: string,
  duplicateKey: string | undefined,
  req: NextRequest
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
  const fields = ACTIVITY_FIELDS;

  for (let i = 0; i < rows.length; i++) {
    const built = buildRecord(rows[i], mappings, fields);
    if (!built.ok) {
      result.failed++;
      result.errors.push({ row: i + 2, message: built.errors.join('; ') });
      continue;
    }
    const data = built.data;
    const companyName = data.companyName as string;

    try {
      const company = await prisma.company.findFirst({
        where: { tenantId, name: { equals: companyName, mode: 'insensitive' }, isActive: true },
      });
      if (!company) {
        result.failed++;
        result.errors.push({ row: i + 2, message: `Company "${companyName}" not found` });
        continue;
      }

      await prisma.activity.create({
        data: {
          tenantId,
          companyId: company.id,
          userId,
          type: data.type as any,
          subject: data.subject as string,
          description: (data.description as string) || null,
          callDirection: (data.callDirection as string) || null,
          callOutcome: (data.callOutcome as string) || null,
          source: 'MANUAL',
        },
      });
      result.created++;
    } catch (err: any) {
      result.failed++;
      result.errors.push({ row: i + 2, message: err.message || 'Database error' });
    }
  }

  return result;
}

// ── Route handler ──

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('Validation failed', 422, parsed.error.issues);
  }

  const { entity, csvData, mappings, tenantId, duplicateMode, duplicateKey } = parsed.data;

  // Verify tenant access
  let accessibleTenantIds: string[] | null = null;
  if (admin.globalRole !== 'SUPER_ADMIN') {
    accessibleTenantIds = await getAccessibleTenantIds(admin);
    if (!accessibleTenantIds || !accessibleTenantIds.includes(tenantId)) {
      return errorResponse('You do not have access to the specified tenant', 403);
    }
  }

  // Parse CSV
  const rows = parseCSV(csvData);
  if (rows.length === 0) {
    return errorResponse('CSV file has no data rows', 400);
  }

  // Limit rows to prevent abuse
  if (rows.length > 5000) {
    return errorResponse('Import file exceeds 5000 row limit. Please split your file.', 400);
  }

  // Process import
  let result: ImportResult;
  const importFns: Record<string, typeof importCompanies> = {
    companies: importCompanies,
    contacts: importContacts,
    deals: importDeals,
    tasks: importTasks,
    activities: importActivities,
  };
  const importFn = importFns[entity];
  if (!importFn) {
    return errorResponse('Invalid entity type', 400);
  }

  result = await importFn(rows, mappings, tenantId, admin.userId!, duplicateMode, duplicateKey, req);

  // Audit log
  await logAudit({
    userId: admin.userId!,
    action: 'import',
    entity: entity === 'companies' ? 'company' : entity === 'contacts' ? 'contact' : entity === 'activities' ? 'activity' : entity.slice(0, -1),
    entityId: tenantId,
    changes: {
      entity,
      tenantId,
      totalRows: rows.length,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    },
    req,
  });

  return NextResponse.json(result, { status: 200 });
}

/** GET — returns field definitions for mapping UI. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity');

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    return NextResponse.json({
      entities: VALID_ENTITIES,
      fields: ENTITY_FIELDS,
    });
  }

  return NextResponse.json({
    entity,
    fields: ENTITY_FIELDS[entity],
  });
}