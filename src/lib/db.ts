// ============================================================================
// Prisma Client — Vega CRM
// ============================================================================
// Single shared Prisma client instance for Next.js App Router.
// Uses a global singleton pattern to avoid exhausting database connections
// during hot reload in development.
// ============================================================================

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
