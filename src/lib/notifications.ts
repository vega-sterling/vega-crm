// ============================================================================
// File: src/lib/notifications.ts
// Description: Notification creation helper. Centralized so any module can
//              create notifications for a user without duplicating logic.
// ============================================================================

import { prisma } from './db';

/**
 * Creates a notification for a user.
 * @param userId - The user who should receive the notification
 * @param type - Notification type (TASK_OVERDUE, DEAL_STAGE_CHANGE, etc.)
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
 * Checks for overdue tasks and creates notifications for assignees.
 * Called by the notification check API or a cron job.
 */
export async function generateOverdueTaskNotifications(): Promise<number> {
  const now = new Date();
  
  // Find overdue tasks that don't have a notification yet
  const overdueTasks = await prisma.task.findMany({
    where: {
      completedAt: null,
      dueDate: { lt: now },
    },
    include: {
      assignee: true,
    },
  });

  let count = 0;
  for (const task of overdueTasks) {
    if (!task.assignedToId) continue;

    // Check if we already notified about this task being overdue today
    const existing = await prisma.notification.findFirst({
      where: {
        userId: task.assignedToId,
        type: 'TASK_OVERDUE',
        entityId: task.id,
        createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) }, // Last 24h
      },
    });

    if (!existing) {
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