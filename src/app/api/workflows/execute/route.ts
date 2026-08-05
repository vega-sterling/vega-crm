// ============================================================================
// POST /api/workflows/execute — Vega CRM
// ============================================================================
// Manually trigger workflow execution for testing, or invoke from the
// workflow engine. Finds active workflows matching the trigger type, evaluates
// conditions against the provided context, executes actions, logs results.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TaskStatus, TaskPriority, Prisma } from "@prisma"
import { prisma } from '@/lib/db';
import { requireSession, getAccessibleTenantIds, errorResponse } from '@/lib/session';
import { validateBody } from '@/lib/validation';

const WorkflowTrigger = z.enum([
  'DEAL_STAGE_CHANGE',
  'NEW_CONTACT',
  'TASK_ASSIGNED',
  'EMAIL_RECEIVED',
  'DEAL_CREATED',
]);

const WorkflowConditionOperator = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'GREATER_THAN',
  'LESS_THAN',
  'EXISTS',
]);

const WorkflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: WorkflowConditionOperator,
  value: z.unknown().optional().nullable(),
});

const WorkflowActionType = z.enum([
  'CREATE_TASK',
  'SEND_EMAIL',
  'ASSIGN_USER',
  'MOVE_DEAL',
  'ADD_TAG',
]);

const WorkflowActionSchema = z.object({
  type: WorkflowActionType,
  config: z.record(z.string(), z.unknown()).default({}),
});

const WorkflowExecuteSchema = z.object({
  tenantId: z.cuid(),
  triggerType: WorkflowTrigger,
  context: z.record(z.string(), z.unknown()).default({}),
  entityType: z.enum(['deal', 'contact', 'task', 'email']).optional(),
  entityId: z.cuid().optional(),
});

type WorkflowCondition = z.infer<typeof WorkflowConditionSchema>;
type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

function triggerTypeToSchemaTrigger(triggerType: string): string {
  return triggerType.toLowerCase().replace(/_/g, '_');
}

function getFieldValue(context: Record<string, unknown>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(context, field)) {
    return context[field];
  }

  const path = field.split('.');
  let current: unknown = context;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function compareValues(operator: string, conditionValue: unknown, actualValue: unknown): boolean {
  const a = conditionValue;
  const b = actualValue;

  switch (operator) {
    case 'EQUALS':
      return String(a) === String(b);
    case 'NOT_EQUALS':
      return String(a) !== String(b);
    case 'CONTAINS':
      return String(b).toLowerCase().includes(String(a).toLowerCase());
    case 'GREATER_THAN': {
      const aNum = typeof a === 'number' ? a : Number(a);
      const bNum = typeof b === 'number' ? b : Number(b);
      return !Number.isNaN(aNum) && !Number.isNaN(bNum) && bNum > aNum;
    }
    case 'LESS_THAN': {
      const aNum = typeof a === 'number' ? a : Number(a);
      const bNum = typeof b === 'number' ? b : Number(b);
      return !Number.isNaN(aNum) && !Number.isNaN(bNum) && bNum < aNum;
    }
    case 'EXISTS':
      return b !== null && b !== undefined && String(b).trim() !== '';
    default:
      return false;
  }
}

function evaluateConditions(
  conditions: WorkflowCondition[] | Prisma.JsonValue,
  context: Record<string, unknown>
): boolean {
  if (!Array.isArray(conditions)) return true;
  if (conditions.length === 0) return true;

  return conditions.every((rawCondition) => {
    const condition = rawCondition as WorkflowCondition | undefined;
    if (!condition) return false;
    const value = getFieldValue(context, condition.field);
    return compareValues(condition.operator, condition.value, value);
  });
}

function matchTriggerConfig(
  triggerConfig: Prisma.JsonValue | null | undefined,
  context: Record<string, unknown>,
  triggerType: string
): boolean {
  const cfg = (triggerConfig ?? {}) as Record<string, unknown>;

  switch (triggerType) {
    case 'deal_stage_': {
      const fromStage = cfg.fromStage as string | undefined;
      const toStage = cfg.toStage as string | undefined;
      if (fromStage && String(context.previousStageId) !== fromStage) return false;
      if (toStage && String(context.stageId) !== toStage) return false;
      return true;
    }
    case 'new_contact': {
      const tags = cfg.tags as string[] | undefined;
      if (tags && tags.length > 0) {
        const contactTags = Array.isArray(context.tags) ? context.tags : [];
        return tags.every((tag) => contactTags.includes(tag));
      }
      return true;
    }
    case 'task_assigned': {
      const userId = cfg.userId as string | undefined;
      if (userId && String(context.assignedToId) !== userId) return false;
      return true;
    }
    case 'email_received': {
      const fromContains = cfg.fromContains as string | undefined;
      if (fromContains) {
        const from = String(context.from || '');
        return from.toLowerCase().includes(String(fromContains).toLowerCase());
      }
      return true;
    }
    case 'deal_created': {
      const valueMin = cfg.valueMin as number | undefined;
      if (valueMin !== undefined && valueMin !== null) {
        const value = Number(context.value);
        return !Number.isNaN(value) && value >= Number(valueMin);
      }
      return true;
    }
    default:
      return true;
  }
}

interface ActionResult {
  action: WorkflowAction;
  success: boolean;
  result?: unknown;
  error?: string;
}

async function executeAction(
  action: WorkflowAction,
  workflow: { id: string; tenantId: string; name: string },
  context: Record<string, unknown>
): Promise<ActionResult> {
  const cfg = action.config as Record<string, unknown>;

  try {
    switch (action.type) {
      case 'CREATE_TASK': {
        const dueDays = typeof cfg.dueInDays === 'number' ? cfg.dueInDays : 1;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dueDays);

        const task = await prisma.task.create({
          data: {
            tenantId: workflow.tenantId,
            companyId: String(context.companyId || context.entityId || ''),
            contactId: (context.contactId as string | undefined) ?? null,
            title: String(cfg.title ?? 'Workflow task'),
            description: (cfg.description as string | undefined) ?? null,
            status: 'PENDING' as TaskStatus,
            priority: 'MEDIUM' as TaskPriority,
            assignedToId: String(cfg.assignedToId ?? context.assignedToId ?? ''),
            createdById: 'system',
            dueDate,
          },
        });
        return { action, success: true, result: { taskId: task.id } };
      }

      case 'MOVE_DEAL': {
        const dealId = String(context.entityId ?? context.dealId ?? '');
        const toStageId = String(cfg.toStageId ?? '');
        if (!dealId || !toStageId) {
          return { action, success: false, error: 'Missing dealId or toStageId' };
        }
        const deal = await prisma.deal.update({
          where: { id: dealId },
          data: { stageId: toStageId },
        });
        return { action, success: true, result: { dealId: deal.id, stageId: deal.stageId } };
      }

      case 'ASSIGN_USER': {
        const entityId = String(context.entityId ?? '');
        const userId = String(cfg.userId ?? '');
        const field = String(cfg.field ?? 'assignedToId');
        if (!entityId || !userId) {
          return { action, success: false, error: 'Missing entityId or userId' };
        }
        const deal = await prisma.deal.update({
          where: { id: entityId },
          data: { [field]: userId },
        });
        return { action, success: true, result: { dealId: deal.id, [field]: userId } };
      }

      case 'ADD_TAG': {
        const tag = String(cfg.tag ?? '');
        if (!tag) return { action, success: false, error: 'Missing tag' };
        return { action, success: true, result: { tag, appliedTo: context.entityId } };
      }

      case 'SEND_EMAIL': {
        const templateId = String(cfg.templateId ?? '');
        const toField = String(cfg.toField ?? 'email');
        const to = String(getFieldValue(context, toField) ?? context.email ?? '');
        if (!templateId || !to) {
          return { action, success: false, error: 'Missing templateId or recipient' };
        }
        return { action, success: true, result: { templateId, to } };
      }

      default:
        return { action, success: false, error: 'Unknown action type' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { action, success: false, error: message };
  }
}

/**
 * POST /api/workflows/execute
 *
 * @param req - JSON body with tenantId, triggerType, context, optional entity info
 * @returns Workflows evaluated and actions executed
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const body = await validateBody(req, WorkflowExecuteSchema);
  if (body instanceof NextResponse) return body;

  const tenantIds = await getAccessibleTenantIds(session);
  if (tenantIds && !tenantIds.includes(body.tenantId)) {
    return errorResponse('Forbidden', 403);
  }

  const schemaTrigger = triggerTypeToSchemaTrigger(body.triggerType);

  const workflows = await prisma.workflow.findMany({
    where: {
      tenantId: body.tenantId,
      trigger: schemaTrigger,
      isActive: true,
    },
  });

  const context = body.context ?? {};
  const results: Array<{
    workflowId: string;
    workflowName: string;
    matched: boolean;
    triggered: boolean;
    actions?: ActionResult[];
    executionId?: string;
    error?: string;
  }> = [];

  for (const workflow of workflows) {
    const matchedConfig = matchTriggerConfig(workflow.triggerConfig, context, schemaTrigger);
    const conditions = (workflow.conditions ?? []) as unknown as WorkflowCondition[];
    const matchedConditions = evaluateConditions(conditions, context);
    const triggered = matchedConfig && matchedConditions;

    if (!triggered) {
      results.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        matched: false,
        triggered: false,
      });
      continue;
    }

    const actions = (workflow.actions ?? []) as WorkflowAction[];
    const actionResults: ActionResult[] = [];

    for (const action of actions) {
      const result = await executeAction(action, workflow, context);
      actionResults.push(result);
    }

    try {
      await prisma.$transaction([
        prisma.workflow.updateMany({
          where: { id: workflow.id },
          data: {
            updatedAt: new Date(),
          },
        }),
        prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            entityId: body.entityId ?? String(context.entityId ?? 'unknown'),
            entityType: body.entityType ?? String(context.entityType ?? 'unknown'),
            status: actionResults.every((r) => r.success) ? 'COMPLETED' : 'FAILED',
            result: actionResults as unknown as Prisma.InputJsonValue,
            error: actionResults.some((r) => !r.success)
              ? actionResults.filter((r) => !r.success).map((r) => r.error).filter(Boolean).join('; ')
              : null,
            executedAt: new Date(),
          },
        }),
      ]);

      const execution = await prisma.workflowExecution.findFirst({
        where: { workflowId: workflow.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      results.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        matched: true,
        triggered: true,
        actions: actionResults,
        executionId: execution?.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        workflowId: workflow.id,
        workflowName: workflow.name,
        matched: true,
        triggered: true,
        actions: actionResults,
        error: message,
      });
    }
  }

  return NextResponse.json({
    triggerType: body.triggerType,
    tenantId: body.tenantId,
    evaluated: workflows.length,
    triggered: results.filter((r) => r.triggered).length,
    results,
  });
}
