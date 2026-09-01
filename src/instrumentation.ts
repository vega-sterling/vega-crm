// ============================================================================
// File: src/instrumentation.ts
// Description: Next.js instrumentation hook — the server-side reminder
//              scheduler. Starts a background timer that runs the smart
//              notification scan (overdue tasks, due-soon tasks, past-close
//              deals, stale deals) every 15 minutes so automated
//              notifications are generated even when nobody is logged in.
//              The timer is unref'd so it never blocks shutdown, and a
//              global symbol flag guards against double registration
//              during hot reload.
// ============================================================================

const SCHEDULER_SYMBOL = Symbol.for('vega.crm.notificationScheduler');

type SchedulerGlobal = typeof globalThis & {
  [SCHEDULER_SYMBOL]?: boolean;
};

const g = globalThis as SchedulerGlobal;

export async function register(): Promise<void> {
  // Only run in the Node.js server runtime, not edge or the build worker.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Guard against double registration (hot reload / multiple workers).
  if (g[SCHEDULER_SYMBOL]) return;
  g[SCHEDULER_SYMBOL] = true;

  const SCAN_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
  const FIRST_SCAN_DELAY_MS = 60 * 1000; // first scan 60s after boot

  const runScan = async () => {
    try {
      // Dynamic import so instrumentation stays decoupled from app code.
      const { runNotificationScan } = await import('./lib/notifications');
      await runNotificationScan();
    } catch (err) {
      console.error('[notifications] scheduler scan failed:', err);
    }
  };

  const timer = setTimeout(function tick() {
    runScan();
    const next = setTimeout(tick, SCAN_INTERVAL_MS);
    if (typeof next.unref === 'function') next.unref();
  }, FIRST_SCAN_DELAY_MS);

  if (typeof timer.unref === 'function') timer.unref();

  console.log(
    `[notifications] scheduler started: first scan in ${FIRST_SCAN_DELAY_MS / 1000}s, then every ${SCAN_INTERVAL_MS / 60000}m`,
  );
}