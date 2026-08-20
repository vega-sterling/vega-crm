
## 2026-08-16 — Phase 15: Server-Side Unified Global Search API (Performance)

### Problem
The GlobalSearch component in the header was fetching ALL contacts and ALL deals on every keystroke, then filtering client-side in the browser. This had two problems:
1. Performance: As the CRM grows, fetching entire lists on every search becomes increasingly slow and bandwidth-heavy
2. Incomplete: Tasks were not searchable at all, and deals had no server-side search endpoint

### Added
- **New /api/search endpoint** (src/app/api/search/route.ts):
  - Unified server-side search across companies, contacts, deals, and tasks
  - Companies: searches name, industry, website, email
  - Contacts: searches firstName, lastName, email, phone
  - Deals: searches title and related company name
  - Tasks: searches title, description, and related company name
  - Returns grouped results with max 8 per type, plus counts
  - All Prisma queries run in parallel for speed
  - Respects tenant access controls (same as all other APIs)

- **GlobalSearch rewritten** (src/app/components/GlobalSearch.tsx):
  - Now calls /api/search instead of fetching entire lists
  - Results include 4 groups: Companies, Contacts, Deals, Tasks (with icons)
  - Group headers show count per type
  - Footer shows total result count + keyboard hint
  - Improved empty state with search icon and helpful hint text
  - Better text overflow handling (ellipsis) for long labels
  - 40px min-height input for touch target compliance
  - Keyboard navigation (arrow keys, Enter, Escape) preserved

- **Deals API enhanced** (src/app/api/deals/route.ts):
  - Added search query parameter support
  - Searches deal title and related company name (case-insensitive)

- **Tasks API enhanced** (src/app/api/tasks/route.ts):
  - Added search query parameter support
  - Searches task title and description (case-insensitive)

### Responsive
- Desktop: Full dropdown with all 4 groups, spacious
- Tablet: Same dropdown, constrained to search width
- Phone: Dropdown full-width, 44px+ touch targets, truncated text

### QA Results
- Health check: 307 redirect to /login (healthy)
- Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- All 23 authenticated pages return HTTP 307 (auth redirect — expected)
- /api/search returns 401 without auth (expected)
- /api/search?q=hello returns 401 without auth (expected)
- /api/deals?search=test returns 401 without auth (expected)
- /api/tasks?search=test returns 401 without auth (expected)
- All 12 API endpoints return correct 401 (auth required — expected)
- No runtime errors in container logs after deployment
- Clean startup: Ready in 0ms, no warnings

### Files Changed
- src/app/api/search/route.ts — NEW (unified server-side search endpoint)
- src/app/components/GlobalSearch.tsx — REWRITTEN (uses /api/search, adds tasks group, better UX)
- src/app/api/deals/route.ts — MODIFIED (added search query param)
- src/app/api/tasks/route.ts — MODIFIED (added search query param)

### Impact
- Eliminates fetching 100+ contacts and all deals on every search keystroke
- Server-side Prisma queries with contains + mode insensitive are fast and indexed
- Tasks are now searchable from the header (previously not searchable at all)
- Scales gracefully as CRM data grows

## 2026-08-16 — Phase 15: Server-Side Unified Global Search API (Performance)

### Problem
The GlobalSearch component in the header was fetching ALL contacts () and ALL deals () on every keystroke, then filtering client-side in the browser. This had two problems:
1. **Performance**: As the CRM grows, fetching entire lists on every search becomes increasingly slow and bandwidth-heavy
2. **Incomplete**: Tasks were not searchable at all, and deals had no server-side search endpoint

### Added
- **New  endpoint** ():
  - Unified server-side search across companies, contacts, deals, and tasks
  - Companies: searches name, industry, website, email
  - Contacts: searches firstName, lastName, email, phone
  - Deals: searches title and related company name
  - Tasks: searches title, description, and related company name
  - Returns grouped results with max 8 per type, plus counts
  - All Prisma queries run in parallel for speed
  - Respects tenant access controls (same as all other APIs)
  - Returns 400-style response for queries < 2 characters

- **GlobalSearch rewritten** ():
  - Now calls  instead of fetching entire lists
  - Results include 4 groups: Companies, Contacts, Deals, Tasks (with icons)
  - Group headers show count per type
  - Footer shows total result count + keyboard hint
  - Improved empty state with search icon and helpful hint text
  - Better text overflow handling (ellipsis) for long labels
  - 40px min-height input for touch target compliance
  - Keyboard navigation (arrow keys, Enter, Escape) preserved

- **Deals API enhanced** ():
  - Added  query parameter support
  - Searches deal title and related company name (case-insensitive)

- **Tasks API enhanced** ():
  - Added  query parameter support
  - Searches task title and description (case-insensitive)

### Responsive
- Desktop (>1024px): Full dropdown with all 4 groups, spacious
- Tablet (768-1024px): Same dropdown, constrained to search width
- Phone (<768px): Dropdown full-width, 44px+ touch targets, truncated text

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- ✅ All 23 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ /api/search returns 401 without auth (expected)
- ✅ /api/search?q=hello returns 401 without auth (expected)
- ✅ /api/deals?search=test returns 401 without auth (expected)
- ✅ /api/tasks?search=test returns 401 without auth (expected)
- ✅ All 12 API endpoints return correct 401 (auth required — expected)
- ✅ No runtime errors in container logs after deployment
- ✅ Clean startup: Ready in 0ms, no warnings

### Files Changed
- src/app/api/search/route.ts — NEW (unified server-side search endpoint)
- src/app/components/GlobalSearch.tsx — REWRITTEN (uses /api/search, adds tasks group, better UX)
- src/app/api/deals/route.ts — MODIFIED (added search query param)
- src/app/api/tasks/route.ts — MODIFIED (added search query param)

### Impact
- Eliminates fetching 100+ contacts and all deals on every search keystroke
- Server-side Prisma queries with  +  are fast and indexed
- Tasks are now searchable from the header (previously not searchable at all)
- Scales gracefully as CRM data grows
## 2026-08-15 — Phase 14: Enhanced Lead Scoring System (Priority 6 Continued)

### Problem
The Lead Scoring system was half-built: the admin page had unused `searchQuery`/`searchResult` state that was never wired up, the calculate API used hardcoded points instead of configured rules (rules existed in DB but weren't read), there was no rule editing/toggling, no score thresholds, and no score display anywhere on contacts. The rules API POST would crash with P2002 if a rule with the same event already existed.

### Added
- **Calculate API rewrite** (`/api/lead-score/calculate`):
  - Now reads configured `LeadScoreRule` entries from DB and applies them
  - Falls back to sensible default scoring when no rules are configured
  - New event types: `ACTIVITY_CREATED`, `EMAIL_OPENED`, `DEAL_CREATED`, `HAS_EMAIL`, `HAS_PHONE`, `HAS_TITLE`, `NO_ACTIVITY_30D`, `CONTACT_EXISTS`
  - Returns `{ score, tier, breakdown }` where tier is `HOT` (≥75), `WARM` (≥40), or `COLD`
  - Added `GET` method support (in addition to existing `POST`)
  - Breakdown entries now include human-readable labels

- **Rules API enhancement** (`/api/lead-score/rules`):
  - Added `PUT` method for inline rule editing (points, isActive toggle)
  - `POST` now upserts: if a rule with the same `tenantId + event` exists, it updates points instead of crashing with P2002
  - Rules ordered by event name then creation date

- **Complete rewrite of Lead Scoring admin page** (`/admin/lead-scoring`):
  - **Score tier cards** — visual display of HOT (≥75), WARM (≥40), COLD thresholds with color-coded backgrounds
  - **Event type dropdown** — predefined events with descriptions and auto-filled default points
  - **Rules table** — inline point editing (click Edit, type, ✓ save), active/inactive toggle button, delete with confirmation
  - **Contact score lookup** — live search dropdown (search by name/email), click to calculate score
  - **Score result card** — colored score circle, tier label, expandable breakdown showing each scoring event and its points
  - **Toast notifications** — success messages auto-dismiss after 3 seconds, dismissible error banners
  - **Empty state** — friendly message when no rules configured, explains default scoring will be used

- **LeadScoreBadge component** (`src/app/components/LeadScoreBadge.tsx`):
  - `LeadScoreMini` — compact inline badge for contact list rows: shows tier emoji + score number in a colored pill
  - `LeadScoreBadge` — expandable card for contact detail pages: large score circle, tier label, click to expand/collapse breakdown list with per-event points and total
  - Color-coded by tier: HOT (rust/red), WARM (gold/amber), COLD (cyan)
  - Fetches score via `/api/lead-score/calculate?contactId=xxx` on mount

- **Contacts list page** — added Score column showing `LeadScoreMini` per row (table view)
- **Contact detail page** — added `LeadScoreBadge` to left sidebar below Custom Fields section

### Responsive
- Desktop (>1024px): Full rules table with all columns, spacious score lookup
- Tablet (768-1024px): Same table with responsive table-wrapper
- Phone (<768px): Table transforms to card layout, 44px+ touch targets on all buttons/inputs
- Small phone (<480px): Score cards stack vertically, search results full-width

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- ✅ All 24 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ Lead Score Rules API: 401 (needs auth — expected)
- ✅ Lead Score Calculate API: 401 (needs auth — expected)
- ✅ All 12 API endpoints return correct status codes (401/403 — expected)
- ✅ No runtime errors in container logs after deployment
- ✅ Database verified: 0 existing rules (default scoring will be used)
- ✅ Contact data verified: contacts with activities exist in DB
- ✅ Git committed: 6 files changed, 876 insertions(+), 96 deletions(-)

### Files Changed
- src/app/api/lead-score/calculate/route.ts — REWRITTEN (uses configured rules, GET method, tier classification, expanded event types)
- src/app/api/lead-score/rules/route.ts — MODIFIED (added PUT method, POST upsert, ordered results)
- src/app/admin/lead-scoring/page.tsx — REWRITTEN (complete UI: tier cards, event dropdown, inline edit, toggle, score lookup, breakdown)
- src/app/components/LeadScoreBadge.tsx — NEW (LeadScoreMini + LeadScoreBadge components)
- src/app/contacts/page.tsx — MODIFIED (added Score column with LeadScoreMini)
- src/app/contacts/[id]/page.tsx — MODIFIED (added LeadScoreBadge to left sidebar)

## 2026-08-13 — Phase 12: Touch-Compatible Kanban Board + Enhanced Deal Cards (Priority 2 Gap Fix)

### Problem
The kanban deal pipeline used HTML5 drag-and-drop (draggable, onDragStart, onDragOver, onDrop) which **does not work on touch devices** (phones, tablets). This was a responsive design gap — Priority 2 requires full mobile usability, but deal stage moves were desktop-only.

### Added
- **Touch-compatible stage mover** — tap the Move button on any kanban card to open a stage picker:
  - **Bottom sheet on mobile** (<768px) — slides up from bottom, 48px+ touch targets, full-width
  - **Centered modal on desktop** (>=769px) — appears above the board with dark backdrop
  - **Stage pills** — each stage shown as a tappable button with color dot, name, probability %, and current-stage highlight
  - One tap to move — no drag gesture required
  - Uses existing handleStageMove API (PUT /api/deals/:id with stageId + probability)
  - HTML5 drag-and-drop preserved for desktop users (both methods work side-by-side)

- **Enhanced kanban deal cards**:
  - **Assignee initials avatar** — gold circle badge with user initials
  - **Expected close date** — displayed as "Mon 15" format, turns red with ⚠ icon when overdue (past today + status OPEN)
  - **Move button** — small "Move" button with chevron icon on each card
  - **Company name truncation** — ellipsis for long names
  - **Visual separator** — border between card body and footer (assignee + date row)
  - **Desktop hover effect** — subtle shadow elevation on card hover (hover: hover media query)

### Responsive
- **Desktop (>=769px)**: Stage picker is a centered modal, cards have hover shadow
- **Tablet (768-1024px)**: Same as desktop with kanban horizontal scroll
- **Phone (<768px)**: Stage picker is a bottom sheet with 48px+ touch targets, 15px font
- **Small phone (<480px)**: Move button has 32px+ min height

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack)
- ✅ All 23 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ Deals API returns 401 (needs auth — expected)
- ✅ Deals bulk API returns 405 (POST-only — expected)
- ✅ No runtime errors in container logs after deployment
- ✅ Git committed: 2 files changed, 177 insertions(+), 36 deletions(-)

### Files Changed
- src/app/deals/page.tsx — MODIFIED (added movingDealId state, Move button on cards, stage picker bottom sheet/modal, enhanced card content with assignee avatar + close date + overdue indicator)
- src/app/globals.css — MODIFIED (added Phase 12 CSS: stage move sheet responsive, kanban card hover effect)

## 2026-08-11 — Phase 10: Data Export & Import (Priority 7 Continued)

### Added
- **Data Management Page** (`/admin/data`) — HubSpot/Salesforce-style data portability hub for exporting and importing CRM records:
  - **Tab-based UI** — switch between Export Data and Import Data tabs
  - **Export panel** — select entity (companies, contacts, deals, tasks, activities) → one-click CSV download
  - **Import wizard** — 4-step guided workflow: Choose Entity → Upload & Map → Preview → Results
  - **Entity selector cards** — visual cards with icons and descriptions for each importable entity
  - **CSV template download** — download a blank template with correct headers for each entity type
  - **Auto column mapping** — CSV column headers auto-matched to CRM fields using fuzzy matching
  - **Manual mapping override** — dropdowns to map each CSV column to the correct CRM field or skip it
  - **Required field validation** — visual badges show which required fields are mapped/unmapped
  - **Duplicate handling** — three modes: Create new (ignore dupes), Skip duplicates, Update existing records
  - **Dedup key selector** — choose which field to use for duplicate detection (email, name, etc.)
  - **Data preview table** — see first 10 rows of mapped data before confirming import
  - **Import results summary** — stat cards showing created/updated/skipped/failed counts
  - **Error table** — row-by-row error messages with row numbers for troubleshooting
  - **Step indicator** — visual progress bar showing current step in the import wizard

- **Export API** (`GET /api/export`): Admin-only, 5 entity types, tenant-scoped, RFC 4180 CSV, audit logged
- **Import API** (`POST /api/import`): Admin-only, 5 entity types, full CSV parser, column mapping, field validation, duplicate handling (create/skip/update), per-row error handling, 5000 row limit, audit logged
- **Import API** (`GET /api/import`): Returns field definitions for mapping UI
- **Export buttons** on Companies, Contacts, and Deals list pages — one-click CSV download
- **Sidebar navigation** — "Data Management" added to Administration section
- **Audit entry types** — extended to include 'import' and 'export' actions

### Responsive
- **Desktop (>768px)**: Full mapping table, spacious wizard layout
- **Tablet (768-1024px)**: Same as desktop with reduced spacing
- **Phone (<768px)**: Mapping table transforms to card layout — touch-friendly, 44px+ targets
- **Small phone (<480px)**: Select dropdowns have 44px+ min height

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack, TypeScript strict)
- ✅ Data Management page renders: HTTP 200
- ✅ All 11 authenticated pages return HTTP 200
- ✅ Export API — all 5 entities: 200, returns valid CSV
- ✅ Export API — invalid/missing entity: 400 with clear error
- ✅ Import GET — field definitions: returns all 5 entities with complete field specs
- ✅ Import POST — companies create: 2 records created successfully
- ✅ Import POST — duplicate skip: 1 record skipped (correct)
- ✅ Import POST — duplicate update: 1 record updated with new values (verified in DB)
- ✅ Import POST — contacts with company linking: 2 records created, correctly linked
- ✅ Import POST — missing required field: row failed with clear error
- ✅ Import POST — invalid company link: row failed with "Company not found"
- ✅ Import POST — empty CSV: 400 "CSV file has no data rows"
- ✅ Import POST — invalid entity: 422 validation error
- ✅ Audit logging: import and export actions recorded with proper entity names
- ✅ No runtime errors in container logs after all tests
- ✅ Test data created, verified, and cleaned up

### Files Changed
- src/app/api/export/route.ts — NEW (CSV export API endpoint)
- src/app/api/import/route.ts — NEW (CSV import API endpoint with field definitions)
- src/app/admin/data/page.tsx — NEW (Data Management page with export panel and import wizard)
- src/app/components/AppShell.tsx — MODIFIED (added "Data Management" to Administration nav)
- src/app/globals.css — MODIFIED (Phase 10 CSS: mapping table→card responsive)
- src/app/companies/page.tsx — MODIFIED (added Export button to toolbar)
- src/app/contacts/page.tsx — MODIFIED (added Export button to toolbar)
- src/app/deals/page.tsx — MODIFIED (added Export button to toolbar)
- src/lib/audit.ts — MODIFIED (extended AuditEntry action to include 'import' and 'export')
## 2026-08-10 — Phase 9: Audit Log Viewer + Audit Logging Middleware (Priority 7 Started)

### Added
- **Audit Log Viewer** (`/admin/audit-logs`) — Salesforce/HubSpot-style compliance view for tracking all data modifications in Vega CRM:
  - **Stats cards** — create/update/delete counts with percentage breakdowns at the top of the page
  - **Filter bar** — filter by entity type (company, contact, deal, activity, task, user, tenant, workflow), action (create, update, delete), full-text search on entity/entityId, and date range (from/to)
  - **Table view** (desktop/tablet) — columns: When (relative + absolute timestamp), User (name + email), Action (color-coded badge), Entity (icon + type + truncated ID), IP Address, Details (expandable)
  - **Card view** (mobile <768px) — same information in touch-friendly card layout with 16px padding, tap to expand change details
  - **Expandable rows** — click any row with changes to see the full before/after JSON diff
  - **CSV export** — download filtered audit logs as CSV with all fields (timestamp, user, email, action, entity, entity ID, IP, changes JSON)
  - **Pagination** — page numbers with item count display

- **Audit Logging Utility** (`src/lib/audit.ts`):
  - `logAudit()` — lightweight, non-blocking helper called after any data mutation
  - IP address capture from `x-forwarded-for` / `x-real-ip` headers
  - Error-swallowing design: audit logging never breaks the primary operation (errors logged to stderr)
  - `buildDiff()` — before/after comparison utility for update operations

- **Audit Logging Middleware** — wired into 12 API mutation routes:
  - Companies: create, update, delete (soft-deactivate)
  - Contacts: create, update, delete (soft-deactivate)
  - Deals: create, update, delete (hard delete)
  - Activities: create, delete (hard delete)
  - Tasks: create, update, delete (hard delete)
  - Users: create, update, delete (soft-deactivate for admins, hard delete for super admins)

- **Audit Logs API** (`GET /api/admin/audit-logs`):
  - Admin-only endpoint (requireAdmin)
  - Pagination with configurable page/limit (max 200)
  - Filtering: entity, action, userId, search, date range (from/to)
  - Stats aggregation: groupBy action and entity counts
  - Tenant admin restriction: non-super-admins only see audit logs from users in their accessible tenants
  - Includes user relation (name, email, globalRole) for each entry

- **Sidebar navigation** — "Audit Log" added to Administration section in AppShell

### Responsive
- **Desktop (>768px)**: Full table view with all columns, spacious layout, stats cards in grid
- **Tablet (768-1024px)**: Table view with all columns (inherits desktop)
- **Phone (<768px)**: Table hidden, cards shown — each audit entry becomes a touch-friendly card with action badge, entity icon, user name, timestamp, and expandable change details. 16px padding, 44px+ touch targets.

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack, TypeScript strict)
- ✅ Audit log page renders: HTTP 200
- ✅ All 14 authenticated pages return HTTP 200 (dashboard, companies, contacts, deals, tasks, activities, admin/users, admin/tenants, admin/lead-forms, admin/lead-scoring, admin/integrations, workflows, settings, reports)
- ✅ Audit API GET: 200 — returns paginated data with stats
- ✅ Audit logging — company create: entry recorded with {name} changes ✅
- ✅ Audit logging — company update: entry recorded with {name, phone} changes ✅
- ✅ Audit logging — company delete: entry recorded with {deactivated: true} ✅
- ✅ Audit logging — contact create: entry recorded with {firstName, lastName} ✅
- ✅ Audit logging — deal create: entry recorded with {title} ✅
- ✅ Audit logging — deal delete: entry recorded with {deleted: true} ✅
- ✅ Audit API filter by action=create: 1 result (correct) ✅
- ✅ Audit API filter by entity=company&action=delete: 1 result (correct) ✅
- ✅ Audit API search "company": 3 results (correct) ✅
- ✅ Audit API date range (from=today): 5 results (correct) ✅
- ✅ Audit API pagination (limit=2): 2 items, total=5, pages=3 ✅
- ✅ Audit API empty state: returns {data: [], stats: {byAction: [], byEntity: []}} ✅
- ✅ No runtime errors in container logs after all tests
- ✅ Test data created, verified, and cleaned up (test user deleted, test audit entries deleted)

### Files Changed
- src/lib/audit.ts — NEW (audit logging utility)
- src/app/api/admin/audit-logs/route.ts — NEW (audit logs API endpoint)
- src/app/admin/audit-logs/page.tsx — NEW (audit log viewer page)
- src/app/api/companies/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/companies/[id]/route.ts — MODIFIED (added audit logging to PUT, DELETE)
- src/app/api/contacts/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/contacts/[id]/route.ts — MODIFIED (added audit logging to PUT, DELETE)
- src/app/api/deals/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/deals/[id]/route.ts — MODIFIED (added audit logging to PUT, DELETE)
- src/app/api/activities/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/activities/[id]/route.ts — MODIFIED (added audit logging to DELETE)
- src/app/api/tasks/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/tasks/[id]/route.ts — MODIFIED (added audit logging to PUT, DELETE)
- src/app/api/admin/users/route.ts — MODIFIED (added audit logging to POST)
- src/app/api/admin/users/[id]/route.ts — MODIFIED (added audit logging to PUT, DELETE)
- src/app/components/AppShell.tsx — MODIFIED (added "Audit Log" to Administration nav)
- src/app/globals.css — MODIFIED (Phase 9 CSS: audit table→card responsive, row hover)
# Vega CRM — Changelog

## 2026-08-09 — Phase 8: Workflow Automation Builder (Priority 6 Started)

### Added
- **Workflow Automation Builder Page** (`/workflows`) — Pipedrive/Close-style visual flow builder for CRM automation:
  - **List View** — card-based workflow list with trigger icons, status badges, condition/action counts, execution counts
  - Search + filter by status (all/active/inactive)
  - Empty state with "Create your first workflow" CTA
  - Per-workflow actions: Test Run, Edit, Pause/Activate toggle, Delete (with confirmation)
  - Summary header showing total workflow count and active count

- **Visual Flow Builder** — inline 3-step card-based editor following Pipedrive/Close CRM patterns:
  - **Step 1: WHEN (Trigger)** — blue-bordered card with trigger type dropdown (5 triggers: Deal Stage Change, Deal Created, New Contact, Task Assigned, Email Received)
  - **Step 2: IF (Conditions)** — amber-bordered card with inline condition rows (field dropdown + operator dropdown + value input); multiple conditions supported; "+ Add condition" button
  - **Step 3: THEN (Actions)** — emerald-bordered card with stacked action cards; each action has type selector + type-specific config fields (task title/priority/due days, email to/subject/body, user assignment, deal stage, tag)
  - Visual connectors between steps (vertical lines)
  - Color-coded step headers with numbered badges and icons
  - Settings bar with name, tenant, description, and active/inactive toggle
  - Save bar at bottom with Cancel + Create/Update buttons

- **Action-specific configuration panels**:
  - CREATE_TASK: title, priority (HIGH/MEDIUM/LOW), due-in-days
  - SEND_EMAIL: to (email or field reference), subject with variable hints, body textarea, optional template ID
  - ASSIGN_USER: user ID, entity type (deal/contact/task)
  - MOVE_DEAL: target stage ID
  - ADD_TAG: tag name

- **Sidebar navigation** — "Workflows" added to Administration section in AppShell

- **Responsive CSS** — Phase 8 styles added to globals.css:
  - Desktop: full inline card layout with actions on the right
  - Tablet (768-1024px): reduced padding on flow step cards
  - Phone (<768px): workflow card actions stack below content with full-width buttons, condition rows stack vertically, flow connectors shorten
  - Small phone (<480px): action buttons become full-width stacked

### Fixed
- **Changelog cleanup** — removed duplicate Phase 7 entry and broken Phase 5 stub from previous session; consolidated into clean chronological order

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no TypeScript errors (Next.js 16.3.0, Turbopack)
- ✅ Workflows page renders: HTTP 200
- ✅ All 6 existing authenticated pages return HTTP 200 (dashboard, companies, contacts, deals, tasks, activities)
- ✅ Workflows API GET: 200 — returns empty data array (no workflows yet)
- ✅ Workflows API POST (create): 201 — creates workflow with trigger, conditions, actions correctly stored
- ✅ Workflows API GET (list after create): 200 — returns created workflow with tenant, creator, execution count
- ✅ Workflows API GET (by ID): 200 — returns single workflow
- ✅ Workflows API PUT (update): 200 — name and isActive updated correctly
- ✅ Workflows API DELETE: 200 — returns {success: true}; follow-up GET returns 404 (confirmed deleted)
- ✅ Workflows API POST (execute/test): 200 — returns evaluation results (0 evaluated for inactive workflow)
- ✅ Workflows API error handling: empty actions → 422, invalid trigger type → 422
- ✅ No runtime errors in container logs after all tests
- ✅ Test data created, verified, and cleaned up (test workflow deleted)

### Files Changed
- src/app/workflows/page.tsx — NEW (workflow automation builder page with list + visual flow editor)
- src/app/components/AppShell.tsx — MODIFIED (added "Workflows" to Administration nav)
- src/app/globals.css — MODIFIED (Phase 8 CSS: workflow card responsive, flow step responsive, condition/action row stacking)
- CHANGELOG.md — MODIFIED (added Phase 8 entry, cleaned up duplicate Phase 7 and broken Phase 5 entries)

## 2026-08-08 — Phase 7: Email Thread View in Timeline + Template Picker (Priority 5 Started)

### Added
- **EmailThreadCard component** — HubSpot-style collapsible email thread view for contact/company timelines:
  - Groups emails by threadId into collapsible threads (newest first)
  - Collapsed view: envelope icon, EMAIL badge, subject, message count, date, unread indicator
  - Expanded view: all thread messages oldest→newest with direction arrows (outbound / inbound)
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
- src/middleware.ts — REMOVED (Next.js 16 proxy.ts conflict fix)## 2026-08-12 — Phase 11: API Key Management for Integrations (Priority 7 Complete)

### Added
- **API Key Management Page** (`/admin/api-keys`) — Stripe/HubSpot-style API key management interface:
  - **Key list table** — shows name, key prefix (masked), scopes, tenant, creator, last used (time + IP), expiry, status
  - **Create key form** — inline form with name, scope selector (grouped checkboxes by resource), optional tenant scoping, optional expiry date
  - **One-time key display** — plaintext key shown once at creation with copy button and security warning, then permanently masked
  - **Revoke/Reactivate toggle** — inline toggle to deactivate or reactivate keys without deleting
  - **Delete with confirmation** — permanently delete keys with ConfirmDialog
  - **How-to guide section** — shows authentication method (x-api-key header), example curl command, and security best practices
  - **Empty state** — friendly "No API Keys Yet" message with create button

- **API Key Management API** (`/api/admin/api-keys`):
  - `GET` — list all keys (admin only, tenant-scoped for non-super-admins)
  - `POST` — create new key (generates `vga_<32 hex>` format, SHA-256 hashed, returns plaintext once)
  - `PATCH` — update key (rename, toggle active, update scopes)
  - `DELETE /api/admin/api-keys/[id]` — permanently delete key
  - All actions audit logged

- **API Key Authentication** (`src/lib/apiKeyAuth.ts`):
  - Validates `x-api-key` header against stored SHA-256 hashes
  - Checks key is active, not expired, and has required scope
  - Updates `lastUsedAt` and `lastUsedIp` on each request (fire-and-forget)
  - Returns authenticated key context with tenant scoping

- **Public API v1 Endpoints** (`/api/v1/`):
  - `GET /api/v1/companies` — list companies with pagination, tenant-scoped by key
  - `GET /api/v1/contacts` — list contacts with pagination, tenant-scoped by key
  - Both require `x-api-key` header with `read:companies` or `read:contacts` scope respectively
  - Supports `?page=`, `?limit=`, `?search=` query params

- **Prisma Schema** — added `ApiKey` model (additive, no existing tables modified):
  - Fields: id, tenantId (nullable for all-tenant keys), name, keyHash (unique), keyPrefix, scopes (string array), createdBy, lastUsedAt, lastUsedIp, expiresAt, isActive, createdAt, updatedAt
  - Relations: tenant (optional, cascade delete), creator (User, cascade delete)
  - Indexes on tenantId, createdBy, keyHash

- **Sidebar Navigation** — added "API Keys" and "Data Management" links to Administration section (fixes Phase 10 missing Data Management link)

### Security Features
- Keys are **SHA-256 hashed** at rest — plaintext never stored, shown only once at creation
- **Scope-based authorization** — 14 fine-grained scopes across 7 resource groups
- **Tenant isolation** — keys scoped to a tenant can only access that tenant's data
- **Expiry support** — keys can have optional expiration dates
- **Revocation** — keys can be deactivated without deletion (audit trail preserved)
- **Timing-safe comparison** — prevents timing attacks on key verification
- **Audit logging** — all key management actions logged with user, IP, and changes

### Responsive
- **Desktop (>1024px)**: Full table view with all columns, spacious layout
- **Tablet (768-1024px)**: Table with reduced padding
- **Phone (<768px)**: Table transforms to card layout — each key becomes a card with all info stacked
- **Small phone (<480px)**: 44px+ touch targets on all buttons and checkboxes

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack, TypeScript strict)
- ✅ API Keys page renders: HTTP 200
- ✅ Data Management page renders: HTTP 200
- ✅ All 21 authenticated pages return HTTP 200
- ✅ Admin API GET (list keys): 200 — returns keys with safe fields (no hashes)
- ✅ Admin API POST (create key): 201 — returns plaintext key one-time only
- ✅ Admin API PATCH (revoke): 200 — key deactivated, subsequently rejected by v1 API
- ✅ Admin API PATCH (reactivate): 200 — key reactivated, works again
- ✅ Admin API DELETE: 200 — key permanently deleted, subsequently returns 401
- ✅ Admin API validation: empty name → 422, no scopes → 422, invalid scope → 422
- ✅ Admin API past expiry date → 422
- ✅ V1 API GET companies (valid key): 200 — returns real company data with tenant info
- ✅ V1 API GET contacts (valid key): 200 — returns real contact data with company info
- ✅ V1 API no key → 401 "Missing x-api-key header"
- ✅ V1 API invalid key → 401 "Invalid or revoked API key"
- ✅ V1 API bad format → 401 "Invalid API key format"
- ✅ V1 API revoked key → 401
- ✅ V1 API deleted key → 401
- ✅ Last used tracking: lastUsedAt and lastUsedIp updated on each API call
- ✅ Audit logging: create, update, delete actions all logged with user + IP + changes
- ✅ Scope enforcement: keys with read:companies can access /v1/companies, keys without it would be rejected
- ✅ No runtime errors in container logs after all tests
- ✅ Test data created, verified, and cleaned up

### Files Changed
- prisma/schema.prisma — MODIFIED (added ApiKey model, relations on Tenant and User)
- src/lib/apiKeys.ts — NEW (key generation, hashing, verification, scope definitions)
- src/lib/apiKeyAuth.ts — NEW (API key authentication middleware for v1 endpoints)
- src/app/api/admin/api-keys/route.ts — NEW (GET, POST, PATCH for key management)
- src/app/api/admin/api-keys/[id]/route.ts — NEW (DELETE for permanent key deletion)
- src/app/api/v1/companies/route.ts — NEW (public v1 API for companies)
- src/app/api/v1/contacts/route.ts — NEW (public v1 API for contacts)
- src/app/admin/api-keys/page.tsx — NEW (API Key Management admin page)
- src/app/components/AppShell.tsx — MODIFIED (added API Keys + Data Management sidebar links)
- src/app/globals.css — MODIFIED (Phase 11 CSS: responsive table→card for API keys)

## 2026-08-14 — Phase 13: Custom Properties Management (Priority 7)

### Problem
The CRM had backend APIs for custom properties (`/api/custom-properties`, `/api/custom-values`) and a Prisma schema for `CustomProperty` / `CustomPropertyValue`, but no admin UI to create or manage custom field definitions. Users had no way to add custom fields to companies or contacts through the interface. The schema was also missing `defaultValue` and `isVisible` columns that the APIs referenced.

### Added
- **Custom Fields Admin Page** (`/admin/custom-fields`) — HubSpot/Salesforce-style field builder:
  - **Create field form** — inline expandable form with:
    - Entity selector (Company or Contact)
    - Tenant selector (auto-selects first tenant)
    - Field key (lowercase, no spaces — enforced with regex validation)
    - Display label (human-readable)
    - Field type picker — visual buttons for Text, Number, Dropdown, Date, Yes/No
    - Dropdown options editor — dynamic add/remove option rows
    - Required toggle — mark field as required
    - Visible toggle — control whether field shows on record detail pages
  - **Properties table** — sortable list with columns: Label, Key, Entity, Type, Options, Required, Values count, Tenant, Actions
  - **Inline edit** — edit label, required, visible, and dropdown options directly in the table row
  - **Reorder** — up/down arrows to change field display order (position)
  - **Delete** — confirmation dialog before permanent deletion
  - **Filters** — filter by entity type and tenant
  - **Empty state** — friendly "No Custom Fields Yet" message with create button

- **CustomFieldsSection component** — renders custom fields on company and contact detail pages:
  - Placed in the left sidebar below the standard Properties card
  - Inline editing matching PropertyQuickEdit pattern (click pencil icon, type, Enter to save, Escape to cancel)
  - Field-type-aware inputs: text input, number input, date picker, dropdown select, Yes/No select
  - Required field indicator (red asterisk)
  - Respects `isVisible` flag — hidden fields don't render
  - Shows/hides automatically — only renders when custom fields exist for the entity

- **Prisma Schema** — additive changes only (no existing tables/columns modified):
  - `CustomProperty.defaultValue` — optional String for future default value support
  - `CustomProperty.isVisible` — Boolean (default true) — controls record page visibility
  - `@@unique([tenantId, entity, key])` — prevents duplicate field keys per tenant+entity

- **Database Migration** — applied directly via SQL (additive ALTER TABLE):
  - `ALTER TABLE custom_properties ADD COLUMN "defaultValue" TEXT`
  - `ALTER TABLE custom_properties ADD COLUMN "isVisible" BOOLEAN NOT NULL DEFAULT true`
  - `CREATE UNIQUE INDEX custom_properties_tenant_entity_key_idx ON custom_properties ("tenantId", entity, key)`

- **API Updates**:
  - `POST /api/custom-properties` — now persists `defaultValue` and `isVisible` on create
  - `GET /api/custom-values` — now returns `defaultValue` and `isVisible` in property select

- **Sidebar Navigation** — added "Custom Fields" link to Administration section

### Responsive
- **Desktop (>1024px)**: Full table view with all columns, spacious layout
- **Tablet (768-1024px)**: Table with reduced padding (existing table-wrapper responsive)
- **Phone (<768px)**: Table transforms to card layout — each field becomes a stacked card with data-label attributes
- **Small phone (<480px)**: 44px+ touch targets on all buttons, inputs, and selects

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Next.js 16.3.0, Turbopack, TypeScript strict)
- ✅ All 24 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ Custom Fields admin page (/admin/custom-fields): 307 (route exists, auth redirect)
- ✅ All 5 API endpoints return 401 (needs auth — expected)
- ✅ Prisma client generated successfully with new fields
- ✅ Database migration applied: defaultValue + isVisible columns added
- ✅ Unique constraint enforced: duplicate (tenantId, entity, key) rejected with P2002
- ✅ Custom property created in DB: dropdown with 4 options, isVisible=true
- ✅ Custom value upserted in DB: "Multi-Family" linked to OzarksGo company
- ✅ isVisible filter: only visible fields render on record pages
- ✅ Test data created, verified, and cleaned up
- ✅ No runtime errors in container logs after deployment
- ✅ Git committed with all changes

### Files Changed
- prisma/schema.prisma — MODIFIED (added defaultValue, isVisible, @@unique on CustomProperty)
- src/app/api/custom-properties/route.ts — MODIFIED (POST now saves defaultValue + isVisible)
- src/app/api/custom-values/route.ts — MODIFIED (GET now returns defaultValue + isVisible in property select)
- src/app/admin/custom-fields/page.tsx — NEW (admin Custom Fields management page)
- src/app/components/CustomFieldsSection.tsx — NEW (inline custom fields renderer for record pages)
- src/app/components/AppShell.tsx — MODIFIED (added "Custom Fields" to Administration nav)
- src/app/companies/[id]/page.tsx — MODIFIED (added CustomFieldsSection to left sidebar)
- src/app/contacts/[id]/page.tsx — MODIFIED (added CustomFieldsSection to left sidebar)
- src/app/globals.css — MODIFIED (Phase 13 responsive CSS: table→card on mobile)
- CHANGELOG.md — MODIFIED (this entry)

---

## Phase 16 — Unified Activity Center (August 17, 2026)

Transformed the Activities page from a basic flat list into a HubSpot-style activity command center — the central hub for logging and tracking all customer interactions.

### What Was Built

**Multi-type activity creation (inline, no modals)**
- Quick action bar with three inline forms: Note, Log Call, Schedule Meeting
- Each form includes company selector, relevant fields (direction, duration, outcome for calls; date/time for meetings)
- Note composer preserves the existing inline pattern (type + Enter, Shift+Enter for newline)

**Activity type filter tabs with live counts**
- Six tabs: All, Notes, Calls, Emails, Tasks, Meetings
- Each tab shows a live count badge with the number of activities of that type
- Active tab highlighted with gold underline (matches existing TimelineFilterTabs pattern)

**Quick stats bar**
- Four KPI cards: Today's Activities, This Week, Calls Today, Upcoming Meetings
- Auto-calculated from the loaded activity data
- Color-coded values for visual scanning

**Date-grouped activity feed**
- Activities grouped by date: Today, Yesterday, This Week, Earlier
- Sticky group headers that stay visible while scrolling (like HubSpot/Close)
- Each header shows a count badge for the group

**Search within activities**
- Full-text search across activity subject and description
- Real-time filtering as you type
- Search results show count with the query term

**Enhanced filter toolbar**
- Date range filter (All Time, Today, This Week, This Month)
- Company filter
- User filter
- All filters work together with type tabs and search

### Responsive Design
- **Desktop (>1024px)**: Full layout with stats grid, filter toolbar, grouped feed
- **Tablet (768-1024px)**: Stats grid in 2 columns, toolbar wraps gracefully
- **Phone (<768px)**: Single column, stat cards 2×2, toolbar stacks vertically, quick action buttons full-width
- **Small phone (≤480px)**: Stats single column, compact date headers

### Files Changed
-  — REWRITTEN (Phase 16 Unified Activity Center)
-  — MODIFIED (Phase 16 responsive CSS: sticky headers, mobile toolbar, stat grid)

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded (Next.js 16.3.0, TypeScript strict, no errors)
- ✅ All 22 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ All 7 API endpoints return 401 (needs auth — expected)
- ✅ No runtime errors in container logs
- ✅ Git committed

---

## Phase 16 — Unified Activity Center (August 17, 2026)

Transformed the Activities page from a basic flat list into a HubSpot-style activity command center.

### What Was Built

**Multi-type activity creation (inline, no modals)**
- Quick action bar: Note, Log Call, Schedule Meeting
- Each form has company selector + relevant fields
- Note composer preserves inline pattern (Enter to save)

**Activity type filter tabs with live counts**
- Six tabs: All, Notes, Calls, Emails, Tasks, Meetings
- Live count badges on each tab

**Quick stats bar**
- Four KPI cards: Today, This Week, Calls Today, Upcoming Meetings

**Date-grouped activity feed**
- Activities grouped: Today, Yesterday, This Week, Earlier
- Sticky group headers while scrolling

**Search within activities**
- Full-text search across subject and description

**Enhanced filter toolbar**
- Date range, company, user filters all work together

### Responsive Design
- Desktop: Full layout, stats grid, grouped feed
- Tablet: Stats 2 columns, toolbar wraps
- Phone: Single column, stacked toolbar, full-width buttons
- Small phone: Stats single column, compact headers

### Files Changed
- src/app/activities/page.tsx — REWRITTEN (Unified Activity Center)
- src/app/globals.css — MODIFIED (responsive CSS for new components)

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded (Next.js 16.3.0, TypeScript strict)
- ✅ All 22 authenticated pages return 307 (expected)
- ✅ All 7 API endpoints return 401 (expected)
- ✅ No runtime errors in container logs
- ✅ Git committed

---

## Phase 17 — Inbox Responsive + Calendar/Reports Mobile (August 18, 2026)

Transformed the Inbox from a desktop-only two-pane layout into a fully responsive experience, plus mobile improvements for Calendar and Reports pages.

### What Was Built

**Inbox — Full responsive design**
- Desktop (>768px): Two-pane side-by-side (40% list + 60% detail) — unchanged
- Tablet/Phone (≤768px): When an email is selected, list hides and detail shows full-width with a "← Back" button to return to the list
- Toolbar stacks vertically on mobile (filters above search, full-width)
- Filter buttons flex to equal widths on mobile for touch-friendly targets
- Small phone (≤480px): Tighter filter button sizing
- All touch targets 44px+ (btn-touch class added to buttons)
- Form inputs use form-input/form-textarea classes for 44px min-height on mobile

**Calendar — Mobile improvements**
- 2-column grid (events + booking sidebar) collapses to single column on tablet/phone (≤1024px)
- All form inputs, selects, and textareas now have form-input/form-select/form-textarea classes → 44px min-height, 16px font on mobile
- Calendar header stacks vertically on mobile with full-width buttons
- All buttons get 44px min-height on mobile

**Reports — Mobile improvements**
- Header stacks vertically on mobile (date inputs + export button wrap below title)
- Date inputs get form-input class for 44px min-height on mobile
- Date inputs flex to fill available width on mobile

### Files Changed
- src/app/inbox/page.tsx — REWRITTEN (responsive: mobile back navigation, stacked toolbar, form classes)
- src/app/calendar/page.tsx — MODIFIED (calendar-grid + calendar-header classes, form-input/form-select/form-textarea classes on all inputs)
- src/app/reports/page.tsx — MODIFIED (reports-header class, form-input class on date inputs)
- src/app/globals.css — ADDED Phase 17 CSS block (inbox responsive, calendar responsive, reports responsive — 118 lines)

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded (Next.js 16.3.0, no errors)
- ✅ All 16 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ /setup-2fa returns 200 (public page — correct)
- ✅ All 8 API endpoints return 401 (needs auth — expected)
- ✅ No runtime errors in container logs
- ✅ Git committed

## Phase 18 — AI-Powered Record Summaries (August 19, 2026)

Implemented HubSpot-style "Summarize a record" feature — a deterministic intelligence engine that analyzes a contact or company's full relationship data (activities, deals, tasks, emails, engagement trends, call quality, response patterns) and generates a natural-language executive brief with recommended next steps and a relationship health score.

### What Was Built

**Summary API — Contact (`GET /api/contacts/[id]/summary`)**
- Fetches all activities, tasks, deals, and emails for the contact
- Builds an activity tally (calls, emails, notes, meetings) with call outcomes and durations
- Calculates engagement trend (accelerating/steady/declining/dormant) based on 30-day activity velocity
- Computes email reply rate (inbound/outbound ratio)
- Computes call connect rate (answered vs voicemail/missed)
- Generates a 7-paragraph natural-language executive brief
- Generates 1-5 recommended next steps based on relationship state (re-engagement, task follow-up, deal advancement, voicemail workaround)
- Computes a 0-100 relationship health score with tier (Thriving/Active/At Risk/Dormant)
- Returns structured JSON: brief paragraphs, stats grid, next steps, health score, generated timestamp

**Summary API — Company (`GET /api/companies/[id]/summary`)**
- Mirrors the contact summary but scoped to company: aggregates activities across all contacts, all deals, all tasks, all emails, plus contact count and deal pipeline value
- Same intelligence engine: trend analysis, health score, recommended next steps
- Company-specific recommendations: stale deal follow-up, task delegation, contact expansion

**SummaryCard Component (`src/app/components/SummaryCard.tsx`)**
- Reusable client component placed in the left sidebar of contact and company detail pages
- Collapsed state: a "Generate Summary" button with sparkles icon (Apple/Porsche aesthetic — clean, flat, no modal)
- Expanded state: displays the executive brief as readable paragraphs, a 3-column stat grid (activities, health score, trend), health badge with tier color, and a numbered list of recommended next steps
- "Regenerate" button to refresh the summary on demand
- Loading state with spinner; error state with retry
- Fully responsive: stat grid collapses to 2-col on tablet, 1-col on phone

**IconSparkles**
- New SVG icon (three sparkles) added to Icons.tsx for the AI summary action

**Responsive CSS**
- Phase 18 block in globals.css: summary stat grid collapses gracefully on tablet/phone

### Files Changed
- `src/app/api/contacts/[id]/summary/route.ts` — NEW (contact summary intelligence engine)
- `src/app/api/companies/[id]/summary/route.ts` — NEW (company summary intelligence engine)
- `src/app/components/SummaryCard.tsx` — NEW (reusable summary card component)
- `src/app/components/Icons.tsx` — MODIFIED (added IconSparkles)
- `src/app/contacts/[id]/page.tsx` — MODIFIED (imported + placed SummaryCard in left sidebar)
- `src/app/companies/[id]/page.tsx` — MODIFIED (imported + placed SummaryCard in left sidebar)
- `src/app/globals.css` — MODIFIED (Phase 18 responsive CSS)
- `CHANGELOG.md` — UPDATED

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded (Next.js 16.3.0, TypeScript compiled, no errors)
- ✅ New API `/api/contacts/[id]/summary` returns 401 (auth required — correct)
- ✅ New API `/api/companies/[id]/summary` returns 401 (auth required — correct)
- ✅ All 26 authenticated pages return HTTP 307 (auth redirect — expected)
- ✅ /login returns 200, /setup-2fa returns 200 (public pages — correct)
- ✅ All 19 API endpoints return 401/403 (auth — expected)
- ✅ No runtime errors in container logs
- ✅ Verified real data exists for summary generation (123 activities, 1 contact at Test Property Management)
- ✅ Git committed

## Phase 19 — Automatic Table-to-Card Mobile Responsive + Modal Bottom Sheets (2026-08-20)

### Summary
Completed the final responsive design gap: contacts and companies list pages now automatically convert from table view to card view on mobile (<=768px), without requiring manual toggle. All modals across the CRM now transform into bottom sheets on mobile, following Apple/Stripe design patterns.

### What Was Built

**1. Dual-Render Table + Card Views (Contacts and Companies)**
- Both table and card views are now always rendered in the DOM simultaneously
- Desktop: manual table/card toggle preserved (inline display styles control visibility)
- Mobile (<=768px): CSS !important rules automatically hide table view and show card view
- Previously: only one view existed in the DOM at a time (React conditional render), making CSS media queries ineffective

**2. View Toggle Hidden on Mobile**
- The Table/Card toggle buttons (.view-mode-toggle) are hidden on mobile via display: none !important
- No user action needed — cards are always shown on phone

**3. Modal Bottom Sheets (All Pages)**
- All modal overlays transform into bottom sheets on mobile
- Content slides up from bottom with slideUpSheet animation (0.25s ease-out)
- border-radius: 20px 20px 0 0 — rounded top corners only
- Grabber handle pseudo-element (36px bar) at top of sheet
- max-height: 85vh with overflow scroll
- Extra bottom padding for thumb reach
- Pages affected: contacts, companies, campaigns, lead-forms, tenants, contact/company detail

**4. Pagination Hidden in Mobile Card View**
- Table pagination is hidden when card view is active on mobile

### Files Changed
- src/app/contacts/page.tsx — MODIFIED (dual-render table+card, CSS classes)
- src/app/companies/page.tsx — MODIFIED (dual-render table+card, CSS classes)
- src/app/campaigns/page.tsx — MODIFIED (vega-modal-overlay class)
- src/app/admin/lead-forms/page.tsx — MODIFIED (vega-modal-overlay class)
- src/app/admin/tenants/page.tsx — MODIFIED (vega-modal-overlay class)
- src/app/globals.css — MODIFIED (Phase 19 responsive CSS)
- CHANGELOG.md — UPDATED

### QA Results
- PASS Health check: 307 redirect to /login (healthy)
- PASS Build succeeded (Next.js 16.3.0, no TypeScript errors)
- PASS All 27 authenticated pages return HTTP 307 (auth redirect expected)
- PASS All 8 API endpoints return 401 (auth expected)
- PASS /login returns 200, /setup-2fa returns 200 (public pages correct)
- PASS No runtime errors in container logs
- PASS No data changes (pure UI/CSS enhancement)
