# Vega CRM — Changelog

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