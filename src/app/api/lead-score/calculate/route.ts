export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const CalcSchema = z.object({ contactId: z.cuid() });

/** Standard scoring event types — matched against LeadScoreRule.event */
const EVENT_TYPES = [
  'ACTIVITY_CREATED',
  'EMAIL_OPENED',
  'DEAL_CREATED',
  'NO_ACTIVITY_30D',
  'HAS_EMAIL',
  'HAS_PHONE',
  'HAS_TITLE',
  'CONTACT_EXISTS',
] as const;

/**
 * Calculate lead score for a single contact using configured rules.
 * GET  /api/lead-score/calculate?contactId=xxx  → { score, tier, breakdown }
 * POST /api/lead-score/calculate { contactId }    → { score, tier, breakdown }
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) return errorResponse('contactId required', 400);

  const result = await calculateScore(contactId);
  if (!result) return errorResponse('Contact not found', 404);

  return NextResponse.json(result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const body = await validateBody(req, CalcSchema);
  if (body instanceof NextResponse) return body;

  const result = await calculateScore(body.contactId);
  if (!result) return errorResponse('Contact not found', 404);

  return NextResponse.json(result);
}

/** Core scoring logic — loads rules, gathers data, computes score */
async function calculateScore(contactId: string) {
  // Load the contact to get tenantId + basic properties
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true, tenantId: true, email: true, phone: true, title: true,
    },
  });
  if (!contact) return null;

  // Load active rules for this tenant
  const rules = await prisma.leadScoreRule.findMany({
    where: { tenantId: contact.tenantId, isActive: true },
  });

  // Gather activity data
  const [activities, emailOpens, deals] = await Promise.all([
    prisma.activity.findMany({
      where: { contactId },
      select: { type: true, createdAt: true },
    }),
    prisma.emailOpen.findMany({
      where: { emailMessage: { contactId } },
      select: { openedAt: true },
    }),
    prisma.deal.findMany({
      where: { contactId },
      select: { stageId: true, createdAt: true, updatedAt: true },
    }),
  ]);

  let score = 0;
  const breakdown: Array<{ event: string; label: string; points: number }> = [];

  // Helper to add a breakdown entry
  const addPoints = (event: string, label: string, points: number) => {
    if (points === 0) return;
    score += points;
    breakdown.push({ event, label, points });
  };

  // If no rules configured, use sensible defaults
  const hasRules = rules.length > 0;

  if (hasRules) {
    // Use configured rules
    for (const rule of rules) {
      switch (rule.event) {
        case 'ACTIVITY_CREATED': {
          const pts = activities.length * rule.points;
          addPoints(rule.event, `${activities.length} activities × ${rule.points}`, pts);
          break;
        }
        case 'EMAIL_OPENED': {
          const pts = emailOpens.length * rule.points;
          addPoints(rule.event, `${emailOpens.length} email opens × ${rule.points}`, pts);
          break;
        }
        case 'DEAL_CREATED': {
          const pts = deals.length * rule.points;
          addPoints(rule.event, `${deals.length} deals × ${rule.points}`, pts);
          break;
        }
        case 'NO_ACTIVITY_30D': {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const hasRecent = activities.some(a => a.createdAt > thirtyDaysAgo);
          if (!hasRecent && activities.length > 0) {
            addPoints(rule.event, 'No activity in 30 days', rule.points);
          }
          break;
        }
        case 'HAS_EMAIL': {
          if (contact.email) addPoints(rule.event, 'Has email address', rule.points);
          break;
        }
        case 'HAS_PHONE': {
          if (contact.phone) addPoints(rule.event, 'Has phone number', rule.points);
          break;
        }
        case 'HAS_TITLE': {
          if (contact.title) addPoints(rule.event, 'Has job title', rule.points);
          break;
        }
        case 'CONTACT_EXISTS': {
          addPoints(rule.event, 'Contact profile exists', rule.points);
          break;
        }
      }
    }
  } else {
    // Default scoring (when no rules configured)
    const activityPoints = activities.length * 5;
    addPoints('ACTIVITY_CREATED', `${activities.length} activities × 5`, activityPoints);

    const openPoints = emailOpens.length * 3;
    addPoints('EMAIL_OPENED', `${emailOpens.length} email opens × 3`, openPoints);

    const dealPoints = deals.length * 10;
    addPoints('DEAL_CREATED', `${deals.length} deals × 10`, dealPoints);

    if (contact.email) addPoints('HAS_EMAIL', 'Has email address', 5);
    if (contact.phone) addPoints('HAS_PHONE', 'Has phone number', 3);
    if (contact.title) addPoints('HAS_TITLE', 'Has job title', 2);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hasRecentActivity = activities.some(a => a.createdAt > thirtyDaysAgo);
    if (!hasRecentActivity && activities.length > 0) {
      addPoints('NO_ACTIVITY_30D', 'No activity in 30 days', -15);
    }
  }

  // Determine tier
  const tier = score >= 75 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';

  return { score, tier, breakdown, eventTypes: EVENT_TYPES };
}