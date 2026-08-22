// ============================================================================
// GET /api/deals/[id]/summary — Vega CRM
// ============================================================================
// AI-powered deal summary — deterministic intelligence engine.
// Analyzes the deal's full relationship data (activities, tasks, emails,
// stage history, timeline, company/contact context) and generates a
// natural-language executive brief with recommended next steps.
//
// Phase 21: Deal Detail Page Enhancement
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
      ? `Deal momentum is accelerating — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`
      : trend === 'down'
        ? `Deal momentum is slowing — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`
        : `Deal activity is steady — ${recent} interactions in the last 30 days vs ${prior} in the prior 30.`;
  return { trend, recent, prior, label };
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && tenantIds.length === 0) return errorResponse('No accessible tenants', 403);

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      tenantId: true,
      value: true,
      currency: true,
      probability: true,
      status: true,
      stageId: true,
      expectedCloseDate: true,
      actualCloseDate: true,
      createdAt: true,
      updatedAt: true,
      companyId: true,
      contactId: true,
      assignedToId: true,
      leadSource: true,
      lossReason: true,
      description: true,
      stage: { select: { id: true, name: true, color: true, probability: true, isWonStage: true, isLostStage: true } },
      company: { select: { id: true, name: true, industry: true, website: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, title: true } },
      assignee: { select: { id: true, name: true } },
    },
  });
  if (!deal) return errorResponse('Deal not found', 404);
  if (tenantIds && !tenantIds.includes(deal.tenantId)) return errorResponse('Access denied', 403);

  const [activities, tasks, emails, stages] = await Promise.all([
    prisma.activity.findMany({
      where: { dealId: id, tenantId: deal.tenantId },
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
      where: { companyId: deal.companyId, tenantId: deal.tenantId },
      orderBy: { dueDate: 'asc' },
      take: 100,
      select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true },
    }),
    prisma.emailMessage.findMany({
      where: { dealId: id, tenantId: deal.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, direction: true, subject: true, createdAt: true, isRead: true },
    }),
    prisma.pipelineStage.findMany({
      where: { tenantId: deal.tenantId },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, position: true, probability: true, isWonStage: true, isLostStage: true },
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

  const lastActivity = activities[0] || null;
  const lastActivityDays = lastActivity ? daysSince(lastActivity.createdAt) : null;
  const lastActivityType = lastActivity?.type || null;

  const trend = engagementTrend(activities);

  const inboundEmails = emails.filter((e) => e.direction === 'inbound').length;
  const outboundEmails = emails.filter((e) => e.direction === 'outbound').length;
  const replyRate = outboundEmails > 0 ? Math.round((inboundEmails / outboundEmails) * 100) : null;

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: deal.currency || 'USD', maximumFractionDigits: 0 }).format(n);

  // ── Stage progression analysis ──
  const currentStageIndex = stages.findIndex((s) => s.id === deal.stageId);
  const totalStages = stages.length;
  const stageProgress = totalStages > 0 ? Math.round(((currentStageIndex + 1) / totalStages) * 100) : 0;
  const currentStage = stages[currentStageIndex];
  const nextStage = currentStageIndex >= 0 && currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null;

  // ── Days in current stage (from updatedAt as proxy) ──
  const daysInStage = daysSince(deal.updatedAt);

  // ── Expected close date analysis ──
  let closeDateStatus: 'on_track' | 'approaching' | 'overdue' | 'no_date' = 'no_date';
  let daysToClose: number | null = null;
  if (deal.expectedCloseDate && deal.status === 'OPEN') {
    daysToClose = Math.ceil((new Date(deal.expectedCloseDate).getTime() - now.getTime()) / 86_400_000);
    if (daysToClose < 0) closeDateStatus = 'overdue';
    else if (daysToClose <= 7) closeDateStatus = 'approaching';
    else closeDateStatus = 'on_track';
  }

  // ── Weighted value ──
  const weightedValue = (deal.value || 0) * (deal.probability || 0) / 100;

  // ── Brief ──
  const brief: string[] = [];

  brief.push(
    `"${deal.title}" is a ${deal.status.toLowerCase()} deal worth ${fmt(deal.value || 0)} at ${deal.probability}% probability (${fmt(weightedValue)} weighted)${deal.company ? ` with ${deal.company.name}` : ''}${deal.contact ? `, primary contact ${deal.contact.firstName} ${deal.contact.lastName}` : ''}.`
  );

  if (currentStage) {
    brief.push(
      `Currently in the "${currentStage.name}" stage${nextStage ? `, next step is "${nextStage.name}"` : ''}. Stage progress: ${stageProgress}% through the pipeline${daysInStage > 0 ? `, in this stage for ${daysInStage} day${daysInStage === 1 ? '' : 's'}` : ''}.`
    );
  }

  if (lastActivityDays !== null) {
    brief.push(
      `Last interaction was ${relativeTime(lastActivity.createdAt)} — a ${lastActivityType?.toLowerCase() || 'activity'}${lastActivity.subject ? ` about "${lastActivity.subject}"` : ''}.`
    );
  } else {
    brief.push(`No activities have been logged yet for this deal.`);
  }

  if (deal.status === 'OPEN' && closeDateStatus !== 'no_date' && daysToClose !== null) {
    if (closeDateStatus === 'overdue') {
      brief.push(`⚠ Expected close date was ${Math.abs(daysToClose)} day${Math.abs(daysToClose) === 1 ? '' : 's'} ago — this deal is past due.`);
    } else if (closeDateStatus === 'approaching') {
      brief.push(`Expected close date is in ${daysToClose} day${daysToClose === 1 ? '' : 's'} — time to push for closure.`);
    } else {
      brief.push(`Expected close date is in ${daysToClose} day${daysToClose === 1 ? '' : 's'}.`);
    }
  }

  if (deal.status === 'WON') {
    brief.push(`This deal was won${deal.actualCloseDate ? ` on ${new Date(deal.actualCloseDate).toLocaleDateString()}` : ''}${deal.actualCloseDate ? ` (${daysSince(deal.actualCloseDate)} days ago)` : ''}.`);
  } else if (deal.status === 'LOST') {
    brief.push(`This deal was lost${deal.lossReason ? ` — reason: ${deal.lossReason}` : ''}.`);
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

  if (deal.status === 'OPEN') {
    if (lastActivityDays !== null && lastActivityDays > 14) {
      nextSteps.push(
        `Re-engage this deal — no activity for ${lastActivityDays} days. Reach out to ${deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : 'the key contact'}.`
      );
    } else if (lastActivityDays !== null && lastActivityDays > 7) {
      nextSteps.push(`Follow up soon — last interaction was ${lastActivityDays} days ago.`);
    }

    if (closeDateStatus === 'overdue') {
      nextSteps.push(`Deal is past its expected close date — either push for closure or update the timeline.`);
    } else if (closeDateStatus === 'approaching') {
      nextSteps.push(`Close date is approaching — schedule a closing meeting this week.`);
    }

    if (nextStage) {
      nextSteps.push(`Advance from "${currentStage?.name || 'current'}" to "${nextStage.name}" — what's needed to move forward?`);
    }

    if (overdueTasks > 0) {
      nextSteps.push(`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} need${overdueTasks === 1 ? 's' : ''} attention on this deal.`);
    }

    if (tally.total === 0) {
      nextSteps.push(`No activities logged — log a call or send an email to start building momentum.`);
    }

    if (emails.length === 0) {
      nextSteps.push(`No email engagement yet — send an introductory email to ${deal.contact ? `${deal.contact.firstName}` : 'the contact'}.`);
    }
  } else if (deal.status === 'WON') {
    nextSteps.push(`Celebrate the win! Send a thank-you email to ${deal.contact ? `${deal.contact.firstName}` : 'the contact'} and explore expansion opportunities.`);
    nextSteps.push(`Look for follow-on deals — ${deal.company?.name || 'this company'} may have additional needs.`);
  } else if (deal.status === 'LOST') {
    nextSteps.push(`Add to a nurture sequence — re-engage in 90 days when circumstances may have changed.`);
    if (deal.lossReason) {
      nextSteps.push(`Address the loss reason ("${deal.lossReason}") in future outreach.`);
    }
  }

  if (nextSteps.length === 0) {
    nextSteps.push(`Deal is on track. Keep the cadence going with ${deal.contact ? `${deal.contact.firstName}` : 'the stakeholder'}.`);
  }

  // ── Health score ──
  let health = 50;
  if (deal.status === 'WON') {
    health = 100;
  } else if (deal.status === 'LOST') {
    health = 10;
  } else {
    // OPEN deal health
    if (lastActivityDays !== null) {
      if (lastActivityDays <= 3) health += 25;
      else if (lastActivityDays <= 7) health += 18;
      else if (lastActivityDays <= 14) health += 10;
      else if (lastActivityDays <= 30) health += 0;
      else health -= 15;
    }
    if (tally.total > 10) health += 10;
    else if (tally.total > 3) health += 5;
    else if (tally.total === 0) health -= 15;
    // Stage progress bonus
    health += Math.round(stageProgress * 0.15);
    // Probability bonus
    if (deal.probability >= 75) health += 10;
    else if (deal.probability >= 50) health += 5;
    else if (deal.probability < 25) health -= 5;
    if (overdueTasks > 0) health -= 10;
    if (closeDateStatus === 'overdue') health -= 10;
    if (trend.trend === 'up') health += 5;
    if (trend.trend === 'down') health -= 5;
    if (replyRate !== null && replyRate > 50) health += 5;
  }
  health = Math.max(0, Math.min(100, health));

  const healthLabel = health >= 75 ? 'Strong' : health >= 50 ? 'Moderate' : health >= 30 ? 'At Risk' : 'Critical';
  const healthColor = health >= 75 ? 'var(--emerald)' : health >= 50 ? 'var(--blue)' : health >= 30 ? 'var(--gold)' : 'var(--rust)';

  return NextResponse.json({
    dealId: id,
    dealName: deal.title,
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
      openTasks,
      overdueTasks,
      completedTasks,
      outboundEmails,
      inboundEmails,
      replyRate,
      lastActivityDays,
      lastActivityType,
      trend: trend.trend,
      dealValue: deal.value || 0,
      weightedValue,
      probability: deal.probability || 0,
      stageProgress,
      currentStageName: currentStage?.name || null,
      nextStageName: nextStage?.name || null,
      daysInStage,
      closeDateStatus,
      daysToClose,
    },
  });
}