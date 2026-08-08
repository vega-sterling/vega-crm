# Vega CRM — Changelog

## 2026-08-07 — Phase 6: Deal List View with Bulk Actions (Priority 4 Complete)

### Added
- **Deal List View** — HubSpot/Pipedrive-style table view for deals, toggled from the Kanban board:
  - Board/List view toggle in the deals page header (gold highlight on active view)
  - Sortable columns: Deal title, Company, Value, Probability, Stage, Owner, Updated — click any header to sort (▲/▼ indicators)
  - Search filter: full-text search across deal title, company, contact, and assignee names
  - Stage filter: filter deals by pipeline stage
  - Assignee filter: filter deals by owner
  - Result count display showing filtered deal count
  - Row click navigates to deal detail page; checkbox click selects without navigating

- **Bulk Actions** — industry-standard bulk operation pattern following HubSpot/Pipedrive:
  - Select-all checkbox in table header with indeterminate state (partial selection)
  - Individual checkboxes per row (and per card on mobile)
  - **Contextual bulk action bar** — sticky bar appears at top when deals selected, showing count and action buttons
  - **Move Stage** — inline stage selector + apply button; moves all selected deals to a new stage with automatic probability/status updates
  - **Reassign** — inline owner selector + apply button; reassigns all selected deals to a new owner
  - **Export CSV** — downloads selected deals as a CSV file with all key fields (title, company, contact, stage, value, probability, status, assignee, dates)
  - **Delete** — confirmation dialog (ConfirmDialog) before permanent deletion; shows exact count
  - **Clear** — deselect all and dismiss the action bar
  - **Success/error feedback** — inline messages with ✓/✗ indicators after each bulk operation
  - Auto-refresh: deals list reloads after each bulk action so changes are visible immediately

- **Bulk Deals API** (`POST /api/deals/bulk`):
  - New endpoint for applying actions to multiple deals at once
  - Actions: `moveStage`, `reassign`, `delete`
  - Security: only deals within accessible tenants are affected — tenant boundary enforced
  - Stage validation: target stage must be accessible; automatically sets WON/LOST status and probability for won/lost stages
  - Zod schema validation: requires action + dealIds array (min 1), stageId for moveStage, assignedToId for reassign
  - Returns `{ updated: count, action: string }`

### Fixed
- **Build blocker**: Removed duplicate `src/middleware.ts` — Next.js 16 requires only `src/proxy.ts` (the renamed middleware replacement). Having both caused a build error ("Both middleware file and proxy file are detected").

### Responsive
- **Desktop (>1024px)**: Full table view with all columns, spacious layout
- **Tablet (768-1024px)**: Table view with reduced font size
- **Phone (<768px)**: Table transforms to card layout — each deal becomes a card with checkbox, title, company, value, stage badge, and probability. Larger 22px touch targets for checkboxes. Bulk action bar becomes full-width stacked layout.

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- ✅ Deals page renders: HTTP 200
- ✅ All 6 authenticated pages return HTTP 200 (dashboard, companies, contacts, deals, tasks, activities)
- ✅ Deals API returns 24 stages, correct deal count
- ✅ Bulk API — moveStage: 2 deals moved, stage + probability updated correctly (verified)
- ✅ Bulk API — reassign: 2 deals reassigned to new owner (verified)
- ✅ Bulk API — delete: 2 deals deleted, confirmed 404 on verification (verified)
- ✅ Bulk API — error handling: empty dealIds → 422, missing stageId → 422, invalid action → 422
- ✅ Bulk API — GET returns 405 (POST-only endpoint)
- ✅ No runtime errors in container logs after all tests
- ✅ Test data created, used for QA, and cleaned up (2 test deals deleted, test user deleted)

### Files Changed
- src/app/api/deals/bulk/route.ts — NEW (bulk deals API endpoint)
- src/app/deals/page.tsx — REWRITTEN (added list view, bulk actions, view toggle)
- src/app/globals.css — MODIFIED (Phase 6 CSS: bulk action bar, responsive table→card)
- src/middleware.ts — REMOVED (Next.js 16 proxy.ts conflict fix)

## 2026-08-06 — Phase 5: Breadcrumb Navigation + Recently Viewed Records

### Added
## 2026-08-08 — Phase 7: Email Thread View in Timeline + Template Picker (Priority 5 Started)

### Added
- **EmailThreadCard component** — HubSpot-style collapsible email thread view for contact/company timelines:
  - Groups emails by threadId into collapsible threads (newest first)
  - Collapsed view: ✉️ icon, EMAIL badge, subject, message count, date, unread indicator
  - Expanded view: all thread messages oldest→newest with direction arrows (↗ outbound / ↘ inbound)
  - Each message shows From, To, Cc, date, and full body text (with HTML stripped for display)
  - Inline reply composer with textarea + Reply button (Ctrl/Cmd+Enter shortcut)
  - Smart reply recipient detection (picks most recent inbound sender)
  - Subject auto-prefixed with Re: (avoids double-prefix)
  - Error feedback on send failure

- **Email thread grouping utility** ():
  -  — groups EmailMessage[] by threadId
  - Emails without threadId get singleton groups (solo-{id})
  - Groups sorted by latestCreatedAt descending

- **Template picker in email composer** (contact page):
  - Dropdown shows available email templates from the tenant
  - Selecting a template fills subject + body with variables replaced
  - Variables supported: {contact.firstName}, {contact.lastName}, {contact.email}, {contact.phone}, {contact.title}, {company.name}, {company.industry}

- **Email loading on company page** — company page now loads and displays email threads in the timeline (previously didn't load emails at all)

### Fixed
- **Contact page API URL bug** — was calling  (non-existent endpoint, silently returned empty). Now correctly calls 
- **EmailMessage TypeScript type** — updated to match actual Prisma schema (toEmails: string[] instead of toEmail: string, bodyText/bodyHtml instead of body, threadId/messageId optional, added isReplied/sentAt/receivedAt and relation fields)
- **Email send API call format** — contact page was sending  but API expects . Fixed on both contact and company pages.
- **Company page email send** — same fix: now sends proper array format + tenantId
- **Inbox reply** — same fix:  now wrapped in array, tenantId added, threadId added to interface

### Responsive
- Email thread cards use  class (inherited responsive padding)
- Reply textarea gets 16px font and 100px min-height on mobile (44px+ touch targets)
- Email body text slightly larger on mobile for readability (15px)
- Thread card padding reduced to 12px on mobile

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- ✅ Email messages API: 200 — returns 2 test emails in same thread with correct fields (toEmails array, threadId, direction)
- ✅ Email templates API: 200 — returns templates list
- ✅ Email templates API POST: 201 — creates template with variables
- ✅ Email send API: 405 on GET (POST-only, correct)
- ✅ Contact page: 200, no runtime errors, template selector present
- ✅ Company page: 200, no runtime errors
- ✅ Inbox page: 200, no runtime errors
- ✅ Templates page: 200, no runtime errors
- ✅ No errors in container logs after all tests
- ✅ Test data (2 test emails) created, verified, and cleaned up
- ✅ Test template Welcome Follow-up created as seed data (with {contact.firstName} and {company.name} variables)

### Files Changed
- src/app/components/EmailThreadCard.tsx — NEW (email thread card component)
- src/app/lib/emailThreads.ts — NEW (email thread grouping utility)
- src/app/lib/types.ts — MODIFIED (fixed EmailMessage interface to match Prisma schema)
- src/app/contacts/[id]/page.tsx — MODIFIED (fixed API URL, added thread grouping, EmailThreadCard, template picker, fixed email send format)
- src/app/companies/[id]/page.tsx — MODIFIED (added email loading, thread grouping, EmailThreadCard, fixed email send format)
- src/app/inbox/page.tsx — MODIFIED (fixed reply send format, added tenantId + threadId to interface)
- src/app/globals.css — MODIFIED (Phase 7 CSS: email thread card responsive styles)
## 2026-08-08 — Phase 7: Email Thread View in Timeline + Template Picker (Priority 5 Started)

### Added
- **EmailThreadCard component** — HubSpot-style collapsible email thread view for contact/company timelines:
  - Groups emails by threadId into collapsible threads (newest first)
  - Collapsed view: envelope icon, EMAIL badge, subject, message count, date, unread indicator
  - Expanded view: all thread messages oldest-to-newest with direction arrows (outbound / inbound)
  - Each message shows From, To, Cc, date, and full body text (with HTML stripped for display)
  - Inline reply composer with textarea + Reply button (Ctrl/Cmd+Enter shortcut)
  - Smart reply recipient detection (picks most recent inbound sender)
  - Subject auto-prefixed with Re: (avoids double-prefix)
  - Error feedback on send failure

- **Email thread grouping utility** (src/app/lib/emailThreads.ts):
  - groupEmailsByThread(emails) groups EmailMessage[] by threadId
  - Emails without threadId get singleton groups (solo-{id})
  - Groups sorted by latestCreatedAt descending

- **Template picker in email composer** (contact page):
  - Dropdown shows available email templates from the tenant
  - Selecting a template fills subject + body with variables replaced
  - Variables supported: {contact.firstName}, {contact.lastName}, {contact.email}, {contact.phone}, {contact.title}, {company.name}, {company.industry}

- **Email loading on company page** — company page now loads and displays email threads in the timeline (previously did not load emails at all)

### Fixed
- **Contact page API URL bug** — was calling /api/email?contactId=X (non-existent endpoint, silently returned empty). Now correctly calls /api/email/messages?contactId=X
- **EmailMessage TypeScript type** — updated to match actual Prisma schema (toEmails: string[] instead of toEmail: string, bodyText/bodyHtml instead of body, threadId/messageId optional, added isReplied/sentAt/receivedAt and relation fields)
- **Email send API call format** — contact page was sending { to: "string" } but API expects { to: ["string"], tenantId }. Fixed on both contact and company pages.
- **Company page email send** — same fix: now sends proper array format + tenantId
- **Inbox reply** — same fix: to now wrapped in array, tenantId added, threadId added to interface

### Responsive
- Email thread cards use panel-container class (inherited responsive padding)
- Reply textarea gets 16px font and 100px min-height on mobile (44px+ touch targets)
- Email body text slightly larger on mobile for readability (15px)
- Thread card padding reduced to 12px on mobile

### QA Results
- Health check: 307 redirect to /login (healthy)
- Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- Email messages API: 200 — returns 2 test emails in same thread with correct fields (toEmails array, threadId, direction)
- Email templates API: 200 — returns templates list
- Email templates API POST: 201 — creates template with variables
- Email send API: 405 on GET (POST-only, correct)
- Contact page: 200, no runtime errors, template selector present
- Company page: 200, no runtime errors
- Inbox page: 200, no runtime errors
- Templates page: 200, no runtime errors
- No errors in container logs after all tests
- Test data (2 test emails) created, verified, and cleaned up
- Test template "Welcome Follow-up" created as seed data (with {contact.firstName} and {company.name} variables)

### Files Changed
- src/app/components/EmailThreadCard.tsx — NEW (email thread card component)
- src/app/lib/emailThreads.ts — NEW (email thread grouping utility)
- src/app/lib/types.ts — MODIFIED (fixed EmailMessage interface to match Prisma schema)
- src/app/contacts/[id]/page.tsx — MODIFIED (fixed API URL, added thread grouping, EmailThreadCard, template picker, fixed email send format)
- src/app/companies/[id]/page.tsx — MODIFIED (added email loading, thread grouping, EmailThreadCard, fixed email send format)
- src/app/inbox/page.tsx — MODIFIED (fixed reply send format, added tenantId + threadId to interface)
- src/app/globals.css — MODIFIED (Phase 7 CSS: email thread card responsive styles)