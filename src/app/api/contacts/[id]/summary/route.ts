// ============================================================================
// GET /api/contacts/[id]/summary — Vega CRM
// ============================================================================
// AI-powered contact summary — deterministic intelligence engine.
// Analyzes the contact's full relationship data (activities, deals, tasks,
// emails, engagement trends, response patterns) and generates a natural-
// language executive brief with recommended next steps.
//
// Design reference: HubSpot "Summarize a record" — a single click in the
// left sidebar generates a contextual brief. No external LLM required;
// the engine is deterministic, privacy-safe, and works offline.
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

// ── Activity type tallies ──────────────────────────────────────────────────
interface ActivityTally {
  total: number;
  calls: number;
  emails: number;
  notes: number;
  meetings: number;
  callOutcomes: Record<string, number>;
  totalCallDuration: number; // seconds
}

function tallyActivities(
  activities: Array<{
    type: string;
    callOutcome?: string | null;
    callDuration?: number | null;
    createdAt: Date | string;
  }>
): ActivityTally {
  const t: ActivityTally = {
    total: activities.length,
    calls: 0,
    emails: 0,
    notes: 0,
    meetings: 0,
    callOutcomes: {},
    totalCallDuration: 0,
  };
  for (const a of activities) {
    if (a.type === 'CALL') {
      t.calls++;
      if (a.callOutcome) t.callOutcomes[a.callOutcome] = (t.callOutcomes[a.callOutcome] || 0) + 1;
      if (a.callDuration) t.totalCallDuration += a.callDuration;
    } else if (a.type === 'EMAIL') t.emails++;
    else if (a.type === 'NOTE') t.notes++;
    else if (a.type === 'MEETING') t.meetings++;
  }
  return t;
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

// ── Engagement trend analysis ────────────────────────────────────────────────
// Looks at activity counts in the last 30 days vs the prior 30 days.
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

// ── Recommended next steps engine ───────────────────────────────────────────
function recommendNextSteps(opts: {
  tally: ActivityTally;
  openTasks: number;
  overdueTasks: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  totalDealValue: number;
  lastActivityDays: number | null;
  lastActivityType: string | null;
  contactName: string;
  hasEmail: boolean;
  hasPhone: boolean;
}): string[] {
  const steps: string[] = [];
  const {
    tally,
    openTasks,
    overdueTasks,
    openDeals,
    wonDeals,
    lostDeals,
    totalDealValue,
    lastActivityDays,
    lastActivityType,
    contactName,
    hasEmail,
    hasPhone,
  } = opts;

  // 1. Stale relationship — no activity in 30+ days
  if (lastActivityDays !== null && lastActivityDays > 30) {
    if (hasPhone) {
      steps.push(
        `Re-engage ${contactName} — no activity for ${lastActivityDays} days. A quick check-in call is overdue.`
      );
    } else if (hasEmail) {
      steps.push(
        `Re-engage ${contactName} — no activity for ${lastActivityDays} days. Send a brief email to re-open the conversation.`
      );
    } else {
      steps.push(
        `Re-engage ${contactName} — no activity for ${lastActivityDays} days, and no phone/email on file. Update contact info first.`
      );
    }
  } else if (lastActivityDays !== null && lastActivityDays > 14) {
    steps.push(
      `Touch base soon — last interaction was ${lastActivityDays} days ago (${lastActivityType || 'activity'}).`
    );
  }

  // 2. Overdue tasks
  if (overdueTasks > 0) {
    steps.push(
      `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} need${overdueTasks === 1 ? 's' : ''} attention — review and reschedule or complete.`
    );
  }

  // 3. Open deals with value
  if (openDeals > 0) {
    const valueStr = totalDealValue > 0 ? ` (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalDealValue)} open pipeline)` : '';
    steps.push(
      `${openDeals} open deal${openDeals === 1 ? '' : 's'}${valueStr} — advance the next stage or schedule a follow-up meeting.`
    );
  }

  // 4. No tasks at all — suggest proactive task creation
  if (openTasks === 0 && overdueTasks === 0 && tally.total < 5) {
    steps.push(
      `Low engagement history (${tally.total} activities). Create a follow-up task to build the relationship.`
    );
  }

  // 5. Calls answered vs voicemail
  const answered = tally.callOutcomes['answered'] || 0;
  const voicemail = (tally.callOutcomes['voicemail'] || 0) + (tally.callOutcomes['missed'] || 0);
  if (tally.calls > 0 && voicemail > answered && voicemail >= 2) {
    steps.push(
      `Calls are reaching voicemail (${voicemail} of ${tally.calls}). Try email or schedule a meeting instead.`
    );
  }

  // 6. Won deals but no recent activity — opportunity for expansion
  if (wonDeals > 0 && lastActivityDays !== null && lastActivityDays > 60) {
    steps.push(
      `${contactName} is a past customer (${wonDeals} won deal${wonDeals === 1 ? '' : 's'}) but hasn't been contacted in ${lastActivityDays} days — explore expansion or renewal.`
    );
  }

  // 7. Lost deals recently — nurture
  if (lostDeals > 0 && openDeals === 0) {
    steps.push(
      `${lostDeals} deal${lostDeals === 1 ? '' : 's'} lost with no open pipeline. Add to a nurture sequence or check in next quarter.`
    );
  }

  // Fallback if nothing surfaced
  if (steps.length === 0) {
    steps.push(`Relationship is healthy and active. Keep the cadence going with ${contactName}.`);
  }

  return steps.slice(0, 4); // cap at 4 for a clean, scannable brief
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  // Tenant scoping
  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return errorResponse('No accessible tenants', 403);

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, industry: true } },
    },
  });
  if (!contact) return errorResponse('Contact not found', 404);
  if (tenantIds && !tenantIds.includes(contact.tenantId)) return errorResponse('Access denied', 403);

  // ── Gather relationship data in parallel ──
  const [activities, tasks, deals, emails] = await Promise.all([
    prisma.activity.findMany({
      where: { contactId: id, tenantId: contact.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        subject: true,
        callOutcome: true,
        callDuration: true,
        callDirection: true,
        createdAt: true,
      },
    }),
    prisma.task.findMany({
      where: { contactId: id, tenantId: contact.tenantId },
      orderBy: { dueDate: 'asc' },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    prisma.deal.findMany({
      where: { contactId: id, tenantId: contact.tenantId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        value: true,
        currency: true,
        status: true,
        probability: true,
        updatedAt: true,
      },
    }),
    prisma.emailMessage.findMany({
      where: { contactId: id, tenantId: contact.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        direction: true,
        subject: true,
        createdAt: true,
        isRead: true,
      },
    }),
  ]);

  // ── Analysis ──
  const tally = tallyActivities(activities);
  const now = new Date();
  const openTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
  const overdueTasks = tasks.filter(
    (t) => (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueDate && new Date(t.dueDate) < now
  ).length;
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const openDeals = deals.filter((d) => d.status === 'OPEN').length;
  const wonDeals = deals.filter((d) => d.status === 'WON').length;
  const lostDeals = deals.filter((d) => d.status === 'LOST').length;
  const totalDealValue = deals
    .filter((d) => d.status === 'OPEN')
    .reduce((sum, d) => sum + (d.value || 0), 0);
  const wonValue = deals
    .filter((d) => d.status === 'WON')
    .reduce((sum, d) => sum + (d.value || 0), 0);

  const lastActivity = activities[0] || null;
  const lastActivityDays = lastActivity ? daysSince(lastActivity.createdAt) : null;
  const lastActivityType = lastActivity?.type || null;

  const trend = engagementTrend(activities);

  // Email response analysis
  const inboundEmails = emails.filter((e) => e.direction === 'inbound').length;
  const outboundEmails = emails.filter((e) => e.direction === 'outbound').length;
  const replyRate = outboundEmails > 0 ? Math.round((inboundEmails / outboundEmails) * 100) : null;

  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'this contact';

  // ── Build natural-language brief ──
  const briefParagraphs: string[] = [];

  // Paragraph 1: Relationship overview
  const companyClause = contact.company?.name ? ` at ${contact.company.name}` : '';
  const titleClause = contact.title ? `, ${contact.title}` : '';
  briefParagraphs.push(
    `${contactName}${titleClause}${companyClause} has ${tally.total} logged activities across ${tally.calls} call${tally.calls === 1 ? '' : 's'}, ${tally.emails} email${tally.emails === 1 ? '' : 's'}, ${tally.notes} note${tally.notes === 1 ? '' : 's'}, and ${tally.meetings} meeting${tally.meetings === 1 ? '' : 's'}.`
  );

  // Paragraph 2: Recency
  if (lastActivityDays !== null) {
    briefParagraphs.push(
      `Last interaction was ${relativeTime(lastActivity.createdAt)} — a ${lastActivityType?.toLowerCase() || 'activity'}${lastActivity.subject ? ` about "${lastActivity.subject}"` : ''}.`
    );
  } else {
    briefParagraphs.push(`No activities have been logged yet for ${contactName}.`);
  }

  // Paragraph 3: Deal status
  if (deals.length > 0) {
    const dealClauses: string[] = [];
    if (openDeals > 0) {
      const valStr = totalDealValue > 0
        ? ` worth ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalDealValue)}`
        : '';
      dealClauses.push(`${openDeals} open${valStr}`);
    }
    if (wonDeals > 0) {
      const valStr = wonValue > 0
        ? ` (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(wonValue)} won)`
        : '';
      dealClauses.push(`${wonDeals} won${valStr}`);
    }
    if (lostDeals > 0) dealClauses.push(`${lostDeals} lost`);
    briefParagraphs.push(`Deal history: ${dealClauses.join(', ')}.`);
  }

  // Paragraph 4: Task status
  if (tasks.length > 0) {
    const taskClauses: string[] = [`${openTasks} open`];
    if (overdueTasks > 0) taskClauses.push(`${overdueTasks} overdue`);
    taskClauses.push(`${completedTasks} completed`);
    briefParagraphs.push(`Tasks: ${taskClauses.join(', ')}.`);
  }

  // Paragraph 5: Email engagement
  if (emails.length > 0) {
    const emailClauses: string[] = [`${outboundEmails} sent`, `${inboundEmails} received`];
    if (replyRate !== null) emailClauses.push(`${replyRate}% reply rate`);
    briefParagraphs.push(`Email engagement: ${emailClauses.join(', ')}.`);
  }

  // Paragraph 6: Call quality
  if (tally.calls > 0) {
    const answered = tally.callOutcomes['answered'] || 0;
    const connectRate = Math.round((answered / tally.calls) * 100);
    const callClauses: string[] = [`${connectRate}% connect rate`];
    if (tally.totalCallDuration > 0) {
      callClauses.push(`${formatDuration(tally.totalCallDuration)} total talk time`);
    }
    briefParagraphs.push(`Call quality: ${callClauses.join(', ')}.`);
  }

  // Paragraph 7: Trend
  briefParagraphs.push(trend.label);

  // ── Recommended next steps ──
  const nextSteps = recommendNextSteps({
    tally,
    openTasks,
    overdueTasks,
    openDeals,
    wonDeals,
    lostDeals,
    totalDealValue,
    lastActivityDays,
    lastActivityType,
    contactName,
    hasEmail: !!contact.email,
    hasPhone: !!contact.phone || !!contact.mobile,
  });

  // ── Health score (0-100) ──
  let health = 50; // baseline
  if (lastActivityDays !== null) {
    if (lastActivityDays <= 7) health += 25;
    else if (lastActivityDays <= 14) health += 15;
    else if (lastActivityDays <= 30) health += 5;
    else if (lastActivityDays > 60) health -= 20;
    else if (lastActivityDays > 30) health -= 10;
  }
  if (tally.total > 10) health += 10;
  else if (tally.total > 3) health += 5;
  else if (tally.total === 0) health -= 15;
  if (openDeals > 0) health += 10;
  if (wonDeals > 0) health += 5;
  if (overdueTasks > 0) health -= 10;
  if (trend.trend === 'up') health += 5;
  if (trend.trend === 'down') health -= 5;
  health = Math.max(0, Math.min(100, health));

  const healthLabel =
    health >= 75 ? 'Strong' : health >= 50 ? 'Moderate' : health >= 30 ? 'At Risk' : 'Critical';
  const healthColor =
    health >= 75 ? 'var(--emerald)' : health >= 50 ? 'var(--blue)' : health >= 30 ? 'var(--gold)' : 'var(--rust)';

  return NextResponse.json({
    contactId: id,
    contactName,
    generatedAt: new Date().toISOString(),
    brief: briefParagraphs,
    nextSteps,
    health: { score: health, label: healthLabel, color: healthColor },
    stats: {
      totalActivities: tally.total,
      calls: tally.calls,
      emails: tally.emails,
      notes: tally.notes,
      meetings: tally.meetings,
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