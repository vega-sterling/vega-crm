// ============================================================================
// GET /api/companies/[id]/summary — Vega CRM
// ============================================================================
// AI-powered company summary — deterministic intelligence engine.
// Analyzes the company's full relationship data (activities, deals, tasks,
// contacts, engagement trends) and generates a natural-language executive
// brief with recommended next steps.
//
// Phase 18: AI-Powered Contact Summaries (Priority 6)
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── Relative time helpers ───────────────────────────────────────────────────
function daysSince(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function relativeTime(d: Date | string): string {
  const days = daysSince(d);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function engagementTrend(
  activities: Array<{ type: string; createdAt: Date | string }>
): { trend: 'up' | 'down' | 'flat'; recent: number; prior: number; label: string } {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const sixtyDaysAgo = now - 60 * 86_400_000;
  let recent = 0;
  let prior = 0;
  for (const a of activities) {
    const ts = new Date(a.createdAt).getTime();
    if (ts >= thirtyDaysAgo) recent++;
    else if (ts >= sixtyDaysAgo) prior++;
  }
  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (recent > prior * 1.25) trend = 'up';
  else if (recent < prior * 0.75) trend = 'down';
  const label =
    trend === 'up'
      ? `Engagement is accelerating — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`
      : trend === 'down'
        ? `Engagement is cooling — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`
        : `Engagement is steady — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`;
  return { trend, recent, prior, label };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return errorResponse('No accessible tenants', 403);

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, tenantId: true, industry: true, website: true },
  });
  if (!company) return errorResponse('Company not found', 404);
  if (tenantIds && !tenantIds.includes(company.tenantId)) return errorResponse('Access denied', 403);

  const [activities, tasks, deals, contacts, emails] = await Promise.all([
    prisma.activity.findMany({
      where: { companyId: id, tenantId: company.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        type: true,
        subject: true,
        callOutcome: true,
        callDuration: true,
        createdAt: true,
      },
    }),
    prisma.task.findMany({
      where: { companyId: id, tenantId: company.tenantId },
      orderBy: { dueDate: 'asc' },
      take: 100,
      select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
    }),
    prisma.deal.findMany({
      where: { companyId: id, tenantId: company.tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, value: true, currency: true, status: true, probability: true, updatedAt: true },
    }),
    prisma.contact.findMany({
      where: { companyId: id, tenantId: company.tenantId, isActive: true },
      take: 50,
      select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true },
    }),
    prisma.emailMessage.findMany({
      where: { companyId: id, tenantId: company.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, direction: true, subject: true, createdAt: true, isRead: true },
    }),
  ]);

  // ── Tally ──
  const tally = {
    total: activities.length,
    calls: activities.filter((a) => a.type === 'CALL').length,
    emails: activities.filter((a) => a.type === 'EMAIL').length,
    notes: activities.filter((a) => a.type === 'NOTE').length,
    meetings: activities.filter((a) => a.type === 'MEETING').length,
    callOutcomes: {} as Record<string, number>,
    totalCallDuration: 0,
  };
  for (const a of activities) {
    if (a.type === 'CALL') {
      if (a.callOutcome) tally.callOutcomes[a.callOutcome] = (tally.callOutcomes[a.callOutcome] || 0) + 1;
      if (a.callDuration) tally.totalCallDuration += a.callDuration;
    }
  }

  const now = new Date();
  const openTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
  const overdueTasks = tasks.filter(
    (t) => (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueDate && new Date(t.dueDate) < now
  ).length;
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const openDeals = deals.filter((d) => d.status === 'OPEN').length;
  const wonDeals = deals.filter((d) => d.status === 'WON').length;
  const lostDeals = deals.filter((d) => d.status === 'LOST').length;
  const totalDealValue = deals.filter((d) => d.status === 'OPEN').reduce((s, d) => s + (d.value || 0), 0);
  const wonValue = deals.filter((d) => d.status === 'WON').reduce((s, d) => s + (d.value || 0), 0);

  const lastActivity = activities[0] || null;
  const lastActivityDays = lastActivity ? daysSince(lastActivity.createdAt) : null;
  const lastActivityType = lastActivity?.type || null;

  const trend = engagementTrend(activities);

  const inboundEmails = emails.filter((e) => e.direction === 'inbound').length;
  const outboundEmails = emails.filter((e) => e.direction === 'outbound').length;
  const replyRate = outboundEmails > 0 ? Math.round((inboundEmails / outboundEmails) * 100) : null;

  const activeContacts = contacts.length;
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  // ── Brief ──
  const brief: string[] = [];

  brief.push(
    `${company.name}${company.industry ? ` (${company.industry})` : ''} has ${activeContacts} active contact${activeContacts === 1 ? '' : 's'} and ${tally.total} logged activities (${tally.calls} call${tally.calls === 1 ? '' : 's'}, ${tally.emails} email${tally.emails === 1 ? '' : 's'}, ${tally.notes} note${tally.notes === 1 ? '' : 's'}, ${tally.meetings} meeting${tally.meetings === 1 ? '' : 's'}).`
  );

  if (lastActivityDays !== null) {
    brief.push(
      `Last interaction was ${relativeTime(lastActivity.createdAt)} — a ${lastActivityType?.toLowerCase() || 'activity'}${lastActivity.subject ? ` about "${lastActivity.subject}"` : ''}.`
    );
  } else {
    brief.push(`No activities have been logged yet for ${company.name}.`);
  }

  if (deals.length > 0) {
    const clauses: string[] = [];
    if (openDeals > 0) clauses.push(`${openDeals} open${totalDealValue > 0 ? ` worth ${fmt(totalDealValue)}` : ''}`);
    if (wonDeals > 0) clauses.push(`${wonDeals} won${wonValue > 0 ? ` (${fmt(wonValue)})` : ''}`);
    if (lostDeals > 0) clauses.push(`${lostDeals} lost`);
    brief.push(`Deal history: ${clauses.join(', ')}.`);
  }

  if (tasks.length > 0) {
    const clauses: string[] = [`${openTasks} open`];
    if (overdueTasks > 0) clauses.push(`${overdueTasks} overdue`);
    clauses.push(`${completedTasks} completed`);
    brief.push(`Tasks: ${clauses.join(', ')}.`);
  }

  if (emails.length > 0) {
    const clauses: string[] = [`${outboundEmails} sent`, `${inboundEmails} received`];
    if (replyRate !== null) clauses.push(`${replyRate}% reply rate`);
    brief.push(`Email engagement: ${clauses.join(', ')}.`);
  }

  if (tally.calls > 0) {
    const answered = tally.callOutcomes['answered'] || 0;
    const connectRate = Math.round((answered / tally.calls) * 100);
    const clauses: string[] = [`${connectRate}% connect rate`];
    if (tally.totalCallDuration > 0) clauses.push(`${formatDuration(tally.totalCallDuration)} total talk time`);
    brief.push(`Call quality: ${clauses.join(', ')}.`);
  }

  brief.push(trend.label);

  // ── Next steps ──
  const nextSteps: string[] = [];

  if (lastActivityDays !== null && lastActivityDays > 30) {
    nextSteps.push(
      `Re-engage ${company.name} — no activity for ${lastActivityDays} days. Schedule a check-in with a key contact.`
    );
  } else if (lastActivityDays !== null && lastActivityDays > 14) {
    nextSteps.push(`Touch base soon — last interaction was ${lastActivityDays} days ago.`);
  }

  if (overdueTasks > 0) {
    nextSteps.push(`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} need${overdueTasks === 1 ? 's' : ''} attention.`);
  }

  if (openDeals > 0) {
    nextSteps.push(`${openDeals} open deal${openDeals === 1 ? '' : 's'}${totalDealValue > 0 ? ` (${fmt(totalDealValue)} pipeline)` : ''} — advance the next stage.`);
  }

  if (activeContacts === 0) {
    nextSteps.push(`No active contacts on file — add a primary contact to start building the relationship.`);
  } else if (activeContacts === 1) {
    nextSteps.push(`Only one contact on file — map additional stakeholders to broaden the relationship.`);
  }

  if (wonDeals > 0 && lastActivityDays !== null && lastActivityDays > 60) {
    nextSteps.push(`${company.name} is a past customer but hasn't been contacted in ${lastActivityDays} days — explore renewal or expansion.`);
  }

  if (lostDeals > 0 && openDeals === 0) {
    nextSteps.push(`${lostDeals} deal${lostDeals === 1 ? '' : 's'} lost with no open pipeline — add to a nurture sequence.`);
  }

  if (nextSteps.length === 0) {
    nextSteps.push(`Account is healthy and active. Keep the cadence going with ${company.name}.`);
  }

  // ── Health score ──
  let health = 50;
  if (lastActivityDays !== null) {
    if (lastActivityDays <= 7) health += 25;
    else if (lastActivityDays <= 14) health += 15;
    else if (lastActivityDays <= 30) health += 5;
    else if (lastActivityDays > 60) health -= 20;
    else health -= 10;
  }
  if (tally.total > 10) health += 10;
  else if (tally.total > 3) health += 5;
  else if (tally.total === 0) health -= 15;
  if (openDeals > 0) health += 10;
  if (wonDeals > 0) health += 5;
  if (overdueTasks > 0) health -= 10;
  if (trend.trend === 'up') health += 5;
  if (trend.trend === 'down') health -= 5;
  if (activeContacts > 1) health += 3;
  health = Math.max(0, Math.min(100, health));

  const healthLabel = health >= 75 ? 'Strong' : health >= 50 ? 'Moderate' : health >= 30 ? 'At Risk' : 'Critical';
  const healthColor = health >= 75 ? 'var(--emerald)' : health >= 50 ? 'var(--blue)' : health >= 30 ? 'var(--gold)' : 'var(--rust)';

  return NextResponse.json({
    companyId: id,
    companyName: company.name,
    generatedAt: new Date().toISOString(),
    brief,
    nextSteps: nextSteps.slice(0, 4),
    health: { score: health, label: healthLabel, color: healthColor },
    stats: {
      totalActivities: tally.total,
      calls: tally.calls,
      emails: tally.emails,
      notes: tally.notes,
      meetings: tally.meetings,
      activeContacts,
      openTasks,
      overdueTasks,
      completedTasks,
      openDeals,
      wonDeals,
      lostDeals,
      totalDealValue,
      wonValue,
      outboundEmails,
      inboundEmails,
      replyRate,
      lastActivityDays,
      lastActivityType,
      trend: trend.trend,
    },
  });
}