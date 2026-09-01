// ============================================================================
// File: src/lib/notifications.ts
// Description: Notification creation helper and smart reminder engine.
//              Centralized so any module can create notifications for a user
//              without duplicating logic. Also contains the automated
//              generators (overdue tasks, due-soon tasks, deal reminders)
//              and runNotificationScan which runs them all safely.
// ============================================================================

import { prisma } from './db';

/** Milliseconds in 24 hours — dedupe window for all generators. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a notification for a user.
 * @param userId - The user who should receive the notification
 * @param type - Notification type (TASK_OVERDUE, TASK_DUE_SOON, etc.)
 * @param title - Short title
 * @param message - Longer description
 * @param entityId - Optional related entity ID
 * @param entityType - Optional entity type ("task", "deal", "contact", etc.)
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  entityId?: string,
  entityType?: string,
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      entityId,
      entityType,
    },
  });
}

/**
 * Creates notifications for multiple users at once.
 */
export async function createNotifications(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  entityId?: string,
  entityType?: string,
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      entityId,
      entityType,
    })),
  });
}

/**
 * Returns true if a notification of the given type for the given user and
 * entity already exists within the last 24 hours (dedupe guard).
 */
async function wasRecentlyNotified(
  userId: string,
  type: string,
  entityId: string,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      entityId,
      createdAt: { gt: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
  });
  return Boolean(existing);
}

/**
 * Checks for overdue tasks and creates notifications for assignees.
 * Skips tasks with no due date. Called by the notification scan.
 */
export async function generateOverdueTaskNotifications(): Promise<number> {
  const now = new Date();

  // Find overdue tasks that don't have a notification yet
  const overdueTasks = await prisma.task.findMany({
    where: {
      completedAt: null,
      dueDate: { not: null, lt: now },
    },
    include: {
      assignee: true,
    },
  });

  let count = 0;
  for (const task of overdueTasks) {
    if (!task.assignedToId) continue;

    // Check if we already notified about this task being overdue today
    const alreadyNotified = await wasRecentlyNotified(
      task.assignedToId,
      'TASK_OVERDUE',
      task.id,
    );

    if (!alreadyNotified) {
      await createNotification(
        task.assignedToId,
        'TASK_OVERDUE',
        'Task Overdue',
        `"${task.title}" was due ${task.dueDate?.toLocaleDateString()}`,
        task.id,
        'task',
      );
      count++;
    }
  }

  return count;
}

/**
 * Finds tasks due within the next 24 hours (not completed, not cancelled)
 * and notifies their assignees. Deduped within 24h per user+type+entity.
 */
export async function generateDueSoonTaskNotifications(): Promise<number> {
  const now = new Date();
  const in24h = new Date(now.getTime() + DEDUPE_WINDOW_MS);

  const dueSoonTasks = await prisma.task.findMany({
    where: {
      completedAt: null,
      status: { not: 'CANCELLED' },
      dueDate: { not: null, gte: now, lte: in24h },
    },
    include: {
      assignee: true,
    },
  });

  let count = 0;
  for (const task of dueSoonTasks) {
    if (!task.assignedToId) continue;

    const alreadyNotified = await wasRecentlyNotified(
      task.assignedToId,
      'TASK_DUE_SOON',
      task.id,
    );

    if (!alreadyNotified) {
      await createNotification(
        task.assignedToId,
        'TASK_DUE_SOON',
        'Task Due Soon',
        `"${task.title}" is due ${task.dueDate?.toLocaleString()}`,
        task.id,
        'task',
      );
      count++;
    }
  }

  return count;
}

/**
 * Finds open deals whose expected close date has passed and notifies the
 * assigned salesperson. Deduped within 24h per user+type+entity.
 */
export async function generateOverdueCloseDateDealNotifications(): Promise<number> {
  const now = new Date();

  const overdueDeals = await prisma.deal.findMany({
    where: {
      status: 'OPEN',
      expectedCloseDate: { not: null, lt: now },
    },
    include: {
      assignee: true,
    },
  });

  let count = 0;
  for (const deal of overdueDeals) {
    if (!deal.assignedToId) continue;

    const alreadyNotified = await wasRecentlyNotified(
      deal.assignedToId,
      'DEAL_CLOSE_OVERDUE',
      deal.id,
    );

    if (!alreadyNotified) {
      await createNotification(
        deal.assignedToId,
        'DEAL_CLOSE_OVERDUE',
        'Deal Past Close Date',
        `"${deal.title}" was expected to close ${deal.expectedCloseDate?.toLocaleDateString()}`,
        deal.id,
        'deal',
      );
      count++;
    }
  }

  return count;
}

/**
 * Finds open deals with no activity (updatedAt) for 14+ days and notifies
 * the assigned salesperson. Deals younger than 14 days are skipped to
 * avoid false positives on fresh deals. Deduped within 24h.
 */
export async function generateStaleDealNotifications(): Promise<number> {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DEDUPE_WINDOW_MS);

  const staleDeals = await prisma.deal.findMany({
    where: {
      status: 'OPEN',
      updatedAt: { lt: fourteenDaysAgo },
      createdAt: { lte: fourteenDaysAgo },
    },
    include: {
      assignee: true,
    },
  });

  let count = 0;
  for (const deal of staleDeals) {
    if (!deal.assignedToId) continue;

    const alreadyNotified = await wasRecentlyNotified(
      deal.assignedToId,
      'DEAL_STALE',
      deal.id,
    );

    if (!alreadyNotified) {
      const daysSinceUpdate = Math.floor(
        (now.getTime() - deal.updatedAt.getTime()) / DEDUPE_WINDOW_MS,
      );
      await createNotification(
        deal.assignedToId,
        'DEAL_STALE',
        'Stale Deal',
        `"${deal.title}" has had no activity for ${daysSinceUpdate} days`,
        deal.id,
        'deal',
      );
      count++;
    }
  }

  return count;
}

/**
 * Runs every automated notification generator and returns a map of
 * type name to generated count. Each generator runs inside its own
 * try/catch so one failure cannot kill the others. A module-level
 * in-memory lock makes concurrent scans skip and return zero counts
 * immediately.
 */
const ZERO_COUNTS: Record<string, number> = {
  TASK_OVERDUE: 0,
  TASK_DUE_SOON: 0,
  DEAL_CLOSE_OVERDUE: 0,
  DEAL_STALE: 0,
};

let scanInProgress = false;

export async function runNotificationScan(): Promise<Record<string, number>> {
  // Concurrent scans skip and return a zero-count result immediately.
  if (scanInProgress) {
    return { ...ZERO_COUNTS };
  }
  scanInProgress = true;

  const counts: Record<string, number> = { ...ZERO_COUNTS };

  const generators: Array<[string, () => Promise<number>]> = [
    ['TASK_OVERDUE', generateOverdueTaskNotifications],
    ['TASK_DUE_SOON', generateDueSoonTaskNotifications],
    ['DEAL_CLOSE_OVERDUE', generateOverdueCloseDateDealNotifications],
    ['DEAL_STALE', generateStaleDealNotifications],
  ];

  for (const [name, generator] of generators) {
    try {
      counts[name] = await generator();
    } catch (err) {
      counts[name] = 0;
      console.error(`[notifications] ${name} generator failed:`, err);
    }
  }

  scanInProgress = false;

  console.log(`[notifications] scan complete ${JSON.stringify(counts)}`);
  return counts;
}