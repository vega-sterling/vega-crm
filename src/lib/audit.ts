// ============================================================================
// File: src/lib/audit.ts
// Description: Audit logging utility for Vega CRM. Provides a lightweight,
//   non-blocking helper that API routes call after any data mutation to
//   record an audit trail entry. Entries are stored in the audit_logs table
//   and surfaced through the admin Audit Log Viewer (/admin/audit-logs).
//
//   Usage (simple — no request object needed):
//     import { logAudit } from '@/lib/audit';
//     await logAudit({
//       userId: session.userId!,
//       action: 'create',
//       entity: 'company',
//       entityId: company.id,
//       changes: { name: company.name },
//     });
//
//   Usage (with request for IP capture):
//     await logAudit({
//       userId: session.userId!,
//       action: 'update',
//       entity: 'company',
//       entityId: id,
//       changes: diff,
//       req,  // optional — enables IP address logging
//     });
// ============================================================================

import { NextRequest } from 'next/server';
import { prisma } from './db';

export interface AuditEntry {
  userId: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'export';
  entity: string;
  entityId: string;
  changes?: Record<string, unknown> | null;
  req?: NextRequest;
}

/**
 * Logs an audit trail entry. Designed to be called after a successful
 * mutation (create/update/delete). Failures are swallowed so that audit
 * logging never breaks the primary operation — the error is logged to
 * stderr instead.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    let ipAddress: string | null = null;
    if (entry.req) {
      try {
        ipAddress =
          entry.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          entry.req.headers.get('x-real-ip') ||
          null;
      } catch {
        // ignore — IP is optional
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        changes: (entry.changes ?? undefined) as any,
        ipAddress,
      },
    });
  } catch (err) {
    // Audit logging must never break the main operation.
    console.error('[audit] Failed to log audit entry:', err);
  }
}

/**
 * Builds a before/after diff object for update operations.
 * Only includes fields that changed.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}