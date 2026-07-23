// ============================================================================
// File: src/lib/validation.ts
// Description: Zod validation schemas for all Vega CRM entities.
//              Covers authentication, TOTP step-up, tenants, companies,
//              contacts, activities, tasks, users, and audit logs. Schemas are
//              split into create and update variants where applicable.
// ============================================================================

import { z, ZodSchema } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "./session";
// ============================================================================
// Shared primitives
// ============================================================================

/** Cuid identifier used throughout the schema. */
const cuid = z.string().cuid();

/** Optional nullable string field. */
const optionalString = z.string().trim().max(255).optional().nullable();

/** Optional nullable longer text field. */
const optionalText = z.string().trim().max(5000).optional().nullable();

// ============================================================================
// Enums
// ============================================================================

/** Global user roles. */
export const globalRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "USER"]);

/** Types of CRM activities. */
export const activityTypeSchema = z.enum(["CALL", "EMAIL", "NOTE", "TASK", "MEETING"]);

/** Task statuses. */
export const taskStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

/** Task priorities. */
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

/** Activity source / origin. */
export const activitySourceSchema = z.enum(["MANUAL", "GMAIL", "VOIP", "IMPORT"]);

// ============================================================================
// Auth schemas
// ============================================================================

/**
 * Validates user credentials for the initial login step.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Validates a TOTP code or backup code submitted during 2FA step-up.
 */
export const totpVerifySchema = z.object({
  code: z.string().trim().min(6, "Code is required"),
});

/**
 * Validates a password change request.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ============================================================================
// User schemas
// ============================================================================

/**
 * Validates data for creating a new user.
 */
export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  name: z.string().trim().min(1, "Name is required").max(120),
  password: z.string().min(12, "Password must be at least 12 characters"),
  globalRole: globalRoleSchema.default("USER"),
  isActive: z.boolean().default(true),
});

/**
 * Validates data for updating an existing user.
 */
export const userUpdateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").optional(),
  name: z.string().trim().min(1).max(120).optional(),
  globalRole: globalRoleSchema.optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Tenant schemas
// ============================================================================

/**
 * Validates data for creating a tenant.
 */
export const tenantCreateSchema = z.object({
  name: z.string().trim().min(1, "Tenant name is required").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  description: optionalText,
  isActive: z.boolean().default(true),
});

/**
 * Validates data for updating a tenant.
 */
export const tenantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Invalid slug")
    .optional(),
  description: optionalText,
  isActive: z.boolean().optional(),
});

// ============================================================================
// Company schemas
// ============================================================================

/**
 * Validates data for creating a company within a tenant.
 */
export const companyCreateSchema = z.object({
  tenantId: cuid,
  name: z.string().trim().min(1, "Company name is required").max(120),
  industry: optionalString,
  website: optionalString,
  phone: optionalString,
  email: z.string().trim().toLowerCase().email("Invalid email address").optional().nullable(),
  address: optionalText,
  description: optionalText,
  isActive: z.boolean().default(true),
});

/**
 * Validates data for updating a company.
 */
export const companyUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  industry: optionalString,
  website: optionalString,
  phone: optionalString,
  email: z.string().trim().toLowerCase().email("Invalid email address").optional().nullable(),
  address: optionalText,
  description: optionalText,
  isActive: z.boolean().optional(),
});

// ============================================================================
// Contact schemas
// ============================================================================

/**
 * Validates data for creating a contact associated with a company.
 */
export const contactCreateSchema = z.object({
  companyId: cuid,
  tenantId: cuid,
  firstName: z.string().trim().min(1, "First name is required").max(120),
  lastName: z.string().trim().min(1, "Last name is required").max(120),
  email: z.string().trim().toLowerCase().email("Invalid email address").optional().nullable(),
  phone: optionalString,
  mobile: optionalString,
  title: optionalString,
  department: optionalString,
  notes: optionalText,
  tags: z.array(z.string().trim().max(50)).default([]),
  isActive: z.boolean().default(true),
});

/**
 * Validates data for updating a contact.
 */
export const contactUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email("Invalid email address").optional().nullable(),
  phone: optionalString,
  mobile: optionalString,
  title: optionalString,
  department: optionalString,
  notes: optionalText,
  tags: z.array(z.string().trim().max(50)).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Activity schemas
// ============================================================================

/**
 * Validates data for creating an activity.
 */
export const activityCreateSchema = z.object({
  type: activityTypeSchema,
  tenantId: cuid,
  companyId: cuid,
  contactId: cuid.optional().nullable(),
  userId: cuid,
  subject: z.string().trim().min(1, "Subject is required").max(255),
  description: optionalText,
  callDirection: z.enum(["inbound", "outbound"]).optional().nullable(),
  callDuration: z.number().int().nonnegative().optional().nullable(),
  callOutcome: optionalString,
  emailFrom: optionalString,
  emailTo: optionalString,
  emailCc: optionalString,
  emailBody: optionalText,
  source: activitySourceSchema.default("MANUAL"),
  externalId: optionalString,
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
});

/**
 * Validates data for updating an activity.
 */
export const activityUpdateSchema = z.object({
  type: activityTypeSchema.optional(),
  contactId: cuid.optional().nullable(),
  subject: z.string().trim().min(1).max(255).optional(),
  description: optionalText,
  callDirection: z.enum(["inbound", "outbound"]).optional().nullable(),
  callDuration: z.number().int().nonnegative().optional().nullable(),
  callOutcome: optionalString,
  emailFrom: optionalString,
  emailTo: optionalString,
  emailCc: optionalString,
  emailBody: optionalText,
  source: activitySourceSchema.optional(),
  externalId: optionalString,
  scheduledAt: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
});

// ============================================================================
// Task schemas
// ============================================================================

/**
 * Validates data for creating a task.
 */
export const taskCreateSchema = z.object({
  tenantId: cuid,
  companyId: cuid,
  contactId: cuid.optional().nullable(),
  title: z.string().trim().min(1, "Title is required").max(255),
  description: optionalText,
  status: taskStatusSchema.default("PENDING"),
  priority: taskPrioritySchema.default("MEDIUM"),
  assignedToId: cuid,
  createdById: cuid,
  dueDate: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
});

/**
 * Validates data for updating a task.
 */
export const taskUpdateSchema = z.object({
  contactId: cuid.optional().nullable(),
  title: z.string().trim().min(1).max(255).optional(),
  description: optionalText,
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assignedToId: cuid.optional(),
  dueDate: z.coerce.date().optional().nullable(),
  completedAt: z.coerce.date().optional().nullable(),
});

// ============================================================================
// UserTenant schema
// ============================================================================

/**
 * Validates a user-tenant association.
 */
export const userTenantCreateSchema = z.object({
  userId: cuid,
  tenantId: cuid,
});

// ============================================================================
// AuditLog schema
// ============================================================================

/**
 * Validates an audit log entry.
 */
export const auditLogCreateSchema = z.object({
  userId: cuid,
  action: z.enum(["create", "update", "delete"]),
  entity: z.enum(["company", "contact", "activity", "task", "user", "tenant"]),
  entityId: cuid,
  changes: z.record(z.unknown()).optional().nullable(),
  ipAddress: optionalString,
});

// ============================================================================
// Request validation helper
// ============================================================================

/**
 * Parse and validate a JSON request body using the provided zod schema.
 * Returns the parsed data, or a NextResponse on validation failure.
 */
export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<T | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue: { path: (string | number)[]; message: string }) => ({
      path: issue.path,
      message: issue.message,
    }));
    return errorResponse("Validation failed", 422, issues);
  }
  return result.data;
}

// ============================================================================
// Type exports
// ============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type UserTenantCreateInput = z.infer<typeof userTenantCreateSchema>;
export type AuditLogCreateInput = z.infer<typeof auditLogCreateSchema>;
