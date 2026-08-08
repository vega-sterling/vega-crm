// ============================================================================
// emailThreads — Utility for grouping EmailMessage[] by threadId.
// Emails without a threadId get their own singleton "thread".
// Returns array of arrays, sorted by most recent createdAt within each group.
// ============================================================================

import type { EmailMessage } from './types'

type EmailThread = {
  threadId: string
  emails: EmailMessage[]
  latestCreatedAt: string
}

/**
 * Group emails into threads. Each group has all emails sharing a threadId
 * (or a synthetic ID for unthreaded emails). Groups are sorted by
 * latestCreatedAt descending (newest thread first).
 */
export function groupEmailsByThread(emails: EmailMessage[]): EmailThread[] {
  const groups = new Map<string, EmailThread>()

  for (const email of emails) {
    const tid = email.threadId || `solo-${email.id}`
    let group = groups.get(tid)
    if (!group) {
      group = { threadId: tid, emails: [], latestCreatedAt: email.createdAt }
      groups.set(tid, group)
    }
    group.emails.push(email)
    if (email.createdAt > group.latestCreatedAt) {
      group.latestCreatedAt = email.createdAt
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
  )
}