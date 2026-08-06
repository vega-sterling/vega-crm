# Vega CRM — Changelog

## 2026-08-06 — Phase 5: Breadcrumb Navigation + Recently Viewed Records

### Added
- **Breadcrumb navigation** — context-aware breadcrumbs on every page:
  - Parses URL path to generate breadcrumb trail (Home › Companies › Company Name)
  - Fetches record names for detail pages via API (company/contact/deal names)
  - Home icon as first crumb, clickable links throughout
  - Chevron separators between crumbs
  - Responsive: hides Home crumb on mobile to save space
  - New IconHome and IconClock SVG icons added to Icons.tsx
- **Recently Viewed Records** — Salesforce-style recent items tracking:
  - RecentlyViewedTracker: invisible component in AppShell that watches route changes and records visits to detail pages (companies, contacts, deals) in localStorage
  - RecentlyViewedDropdown: header button with clock icon that opens a dropdown showing the last 8 recently viewed records, with record type icons, names, and relative timestamps
  - RecentlyViewedSidebar: compact list at the bottom of the sidebar showing the 5 most recent records with colored type icons
  - Smart deduplication (most recent visit wins), max 20 records stored
  - Relative time formatting ("2m ago", "1h ago", "3d ago")
  - Click any recent item to navigate directly to that record
  - Responsive: sidebar list scrolls, dropdown is touch-friendly with 44px tap targets

### Enhanced
- **AppShell**: Integrated breadcrumbs (below header bar, above page content), recently viewed dropdown (in header next to notification bell), recently viewed sidebar (at bottom of sidebar nav), and invisible tracker component
- **globals.css**: Added responsive CSS rules for breadcrumbs (hide home crumb on mobile) and recently viewed components
- **Icons.tsx**: Added IconClock (clock face with hands) and IconHome (house outline) to the icon set

### QA Results
- ✅ Health check: 307 redirect to /login (healthy)
- ✅ Build succeeded with no errors (Turbopack/Next.js 16.3.0)
- ✅ All 8 authenticated pages return HTTP 200 (dashboard, companies, contacts, deals, tasks, activities, company detail, contact detail)
- ✅ All 7 API endpoints return HTTP 200 with authentication
- ✅ No runtime errors in container logs after hitting all pages
- ✅ Component code confirmed in compiled JS bundles
- ✅ Test user created, used for QA, and cleaned up (deleted from DB)
- ✅ Login/logout flow working correctly

### Files Changed
- src/app/components/Breadcrumbs.tsx — NEW (191 lines)
- src/app/components/RecentlyViewed.tsx — NEW (391 lines)
- src/app/components/AppShell.tsx — MODIFIED (integrated breadcrumbs + recently viewed)
- src/app/components/Icons.tsx — MODIFIED (added IconClock + IconHome)
- src/app/globals.css — MODIFIED (responsive CSS for new components)

## 2026-08-05 — Phase 4: Deal Detail Page 3-Column Layout + P0 Bug Fix

### Fixed
- **P0 bug**: Deal detail page (`/deals/[id]`) was completely broken — it called 3 non-existent/broken API endpoints inside a `Promise.all` that failed entirely if any one rejected. The page showed only an error message.
  - `/api/deals/stages` — did not exist (stages come from `/api/pipeline-stages`)
  - `/api/deals/{id}/activities` — did not exist
  - `/api/tasks?dealId=` — Task model has no `dealId` field, filter unsupported

### Enhanced
- **Deal detail page rewritten as HubSpot-style 3-column layout**:
  - **Left column**: Deal properties panel with quick stage/status changers, value, probability, weighted value (for forecasting), expected/actual close dates, lead source, assignee, created date, and description
  - **Middle column**: Inline note composer (type + Enter, no modal), quick action bar (Log Call, Create Task, Send Email, Schedule Meeting), timeline filter tabs (All/Notes/Calls/Emails/Tasks/Meetings), activity timeline with pinned notes support
  - **Right column**: Associated records — company link, contact link, open tasks panel, recent emails panel
- **Activities API** (`/api/activities`): Added `dealId` query filter and `dealId` to create schema so new activities can be linked to deals
- **InlineNoteComposer**: Now accepts optional `dealId` prop — notes created on a deal page are linked to that deal
- **QuickActionBar**: CallForm and MeetingForm now accept optional `dealId` prop — logged calls and scheduled meetings are linked to the deal
- **Resilience**: All data fetches on the deal page now use graceful `.catch()` fallbacks — one failed API call no longer breaks the entire page
- **Responsive**: 3-column desktop → 2-column tablet → 1-column phone (leveraging existing CSS breakpoints)

### QA Results
- ✅ Health check: 307 redirect (healthy)
- ✅ `/deals/[id]` page renders: HTTP 200
- ✅ All 6 API endpoints respond correctly with authentication
- ✅ Note creation with dealId: note linked to deal (verified)
- ✅ Real task data flows (OzarksGo company task appeared in right panel)
- ✅ 11/11 key UI elements verified in rendered HTML
- ✅ Test data cleaned up (test deal and note deleted)
- ✅ No runtime errors in container logs