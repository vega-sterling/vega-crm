// ============================================================================
// File: src/lib/apiKeys.ts
// Description: API key generation, hashing, and verification utilities.
//              Keys use format: vga_<32 hex chars> (36 chars total).
//              Keys are hashed with SHA-256 before storage — plaintext shown
//              only once at creation time (Stripe/HubSpot pattern).
// ============================================================================

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Prefix for all Vega CRM API keys. */
export const KEY_PREFIX = 'vga_';

/** Length of the random portion (in hex chars = 16 bytes). */
const RANDOM_HEX_LENGTH = 32;

/** Number of chars to show in the prefix for identification. */
const PREFIX_DISPLAY_LENGTH = 12;

/**
 * Generates a new API key string.
 * Format: vga_<32 hex chars>
 */
export function generateApiKey(): string {
  const random = randomBytes(16).toString('hex'); // 32 hex chars
  return KEY_PREFIX + random;
}

/**
 * Hashes an API key using SHA-256 for secure storage.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Returns a display prefix for identification (e.g., vga_a1b2c3d4).
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, PREFIX_DISPLAY_LENGTH);
}

/**
 * Masks a key prefix for display: vga_a1b2...****
 */
export function maskKeyPrefix(prefix: string): string {
  if (prefix.length <= 8) return prefix;
  return prefix.substring(0, 8) + '...';
}

/**
 * Verifies a plaintext API key against a stored hash using timing-safe comparison.
 */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const computedHash = hashApiKey(key);
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * All available API scopes.
 */
export const ALL_SCOPES = [
  'read:companies',
  'write:companies',
  'read:contacts',
  'write:contacts',
  'read:deals',
  'write:deals',
  'read:activities',
  'write:activities',
  'read:tasks',
  'write:tasks',
  'read:projects',
  'write:projects',
  'read:reports',
  'read:users',
] as const;

export type ApiScope = (typeof ALL_SCOPES)[number];

/**
 * Scope groupings for UI display.
 */
export const SCOPE_GROUPS: { label: string; scopes: { value: string; label: string }[] }[] = [
  {
    label: 'Companies',
    scopes: [
      { value: 'read:companies', label: 'Read companies' },
      { value: 'write:companies', label: 'Create & update companies' },
    ],
  },
  {
    label: 'Contacts',
    scopes: [
      { value: 'read:contacts', label: 'Read contacts' },
      { value: 'write:contacts', label: 'Create & update contacts' },
    ],
  },
  {
    label: 'Deals',
    scopes: [
      { value: 'read:deals', label: 'Read deals' },
      { value: 'write:deals', label: 'Create & update deals' },
    ],
  },
  {
    label: 'Activities',
    scopes: [
      { value: 'read:activities', label: 'Read activities' },
      { value: 'write:activities', label: 'Log activities' },
    ],
  },
  {
    label: 'Tasks',
    scopes: [
      { value: 'read:tasks', label: 'Read tasks' },
      { value: 'write:tasks', label: 'Create & update tasks' },
    ],
  },
  {
    label: 'Projects',
    scopes: [
      { value: 'read:projects', label: 'Read projects' },
      { value: 'write:projects', label: 'Create & update projects' },
    ],
  },
  {
    label: 'Reports & Users',
    scopes: [
      { value: 'read:reports', label: 'Read reports & analytics' },
      { value: 'read:users', label: 'Read user list' },
    ],
  },
];

/**
 * Validates that all strings in the array are valid scopes.
 */
export function validateScopes(scopes: string[]): boolean {
  const validSet = new Set(ALL_SCOPES as readonly string[]);
  return scopes.every((s) => validSet.has(s));
}

/**
 * Checks if a set of scopes includes the required scope.
 */
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}
