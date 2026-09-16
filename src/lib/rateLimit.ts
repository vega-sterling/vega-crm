// ============================================================================
// File: src/lib/rateLimit.ts
// Description: Lightweight in-memory token-bucket rate limiter for the
//              v1 public API. Keyed by API key id (or IP when no key is
//              present). Enforces a 100 req / 10 s burst window plus a
//              10,000 req / day daily quota. Rejected requests do not
//              consume tokens. Returns standard Retry-After and
//              X-RateLimit-* metadata.
// ============================================================================

interface Bucket {
  tokens: number;
  lastRefill: number;
  dailyTokens: number;
  dayStarted: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  windowSeconds: number;
  dailyLimit: number;
  remaining: number;
  dailyRemaining: number;
  retryAfter?: number;
}

const WINDOW_MS = 10_000;
const WINDOW_SECONDS = WINDOW_MS / 1000;
const BURST_LIMIT = 100;
export const RATE_LIMIT = BURST_LIMIT;
export const RATE_WINDOW_SECONDS = WINDOW_SECONDS;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 10_000;

const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();

function sweepStaleBuckets() {
  const now = Date.now();
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > WINDOW_MS * 2 && now - bucket.dayStarted > DAY_MS) {
      buckets.delete(key);
    }
  }
}

/**
 * Check whether a request from the given key is within rate limits.
 *
 * @param key - Identifier for the caller (e.g. `key:${apiKeyId}` or `ip:${ip}`)
 * @returns Rate limit decision and header metadata
 */
export function checkRateLimit(key: string): RateLimitResult {
  sweepStaleBuckets();

  const now = Date.now();
  const todayStart = new Date().setUTCHours(0, 0, 0, 0);
  let bucket = buckets.get(key);

  if (!bucket || bucket.dayStarted < todayStart) {
    bucket = {
      tokens: BURST_LIMIT,
      lastRefill: now,
      dailyTokens: DAILY_LIMIT,
      dayStarted: todayStart,
    };
  }

  // Refill burst tokens based on elapsed time (sliding window)
  const elapsedMs = now - bucket.lastRefill;
  const tokensToAdd = Math.floor((elapsedMs / WINDOW_MS) * BURST_LIMIT);
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(BURST_LIMIT, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  // Daily tokens reset already handled above; otherwise consume 1 on allowed
  const allowed = bucket.tokens > 0 && bucket.dailyTokens > 0;

  if (!allowed) {
    // Compute Retry-After for whichever window is exhausted.
    // If the burst bucket is empty, the next token refills in WINDOW_MS / BURST_LIMIT.
    const burstRetryAfter = bucket.tokens > 0 ? 0 : Math.max(1, Math.ceil(WINDOW_MS / BURST_LIMIT / 1000));
    const dailyRetryAfter = bucket.dailyTokens > 0 ? 0 : Math.max(1, Math.ceil((bucket.dayStarted + DAY_MS - now) / 1000));
    const retryAfter = Math.max(burstRetryAfter, dailyRetryAfter, 1);

    return {
      allowed: false,
      limit: BURST_LIMIT,
      windowSeconds: WINDOW_SECONDS,
      dailyLimit: DAILY_LIMIT,
      remaining: bucket.tokens,
      dailyRemaining: bucket.dailyTokens,
      retryAfter,
    };
  }

  bucket.tokens -= 1;
  bucket.dailyTokens -= 1;
  buckets.set(key, bucket);

  return {
    allowed: true,
    limit: BURST_LIMIT,
    windowSeconds: WINDOW_SECONDS,
    dailyLimit: DAILY_LIMIT,
    remaining: bucket.tokens,
    dailyRemaining: bucket.dailyTokens,
  };
}

/**
 * Returns the bucket state for a key without consuming tokens.
 * Useful for attaching rate-limit headers to successful responses.
 */
export function getRateLimitState(key: string): Omit<RateLimitResult, 'allowed' | 'retryAfter'> {
  const check = checkRateLimit(key);
  // If check allowed, it consumed a token; put it back for read-only inspection.
  if (check.allowed) {
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.tokens += 1;
      bucket.dailyTokens += 1;
    }
  }
  return {
    limit: check.limit,
    windowSeconds: check.windowSeconds,
    dailyLimit: check.dailyLimit,
    remaining: check.remaining,
    dailyRemaining: check.dailyRemaining,
  };
}
