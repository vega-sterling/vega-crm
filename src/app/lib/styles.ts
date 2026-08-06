import type { CSSProperties } from 'react'

/**
 * Vega CRM — Shared style constants (inline-style pattern).
 *
 * Phase 2 UI/UX improvements:
 * - Typography: letter-spacing -0.02em on headings, 600 for H1, 500 for H2, 400 body.
 * - Depth: panel containers gain subtle box-shadow via .panel-container class.
 * - Refined color variables: --gold #b8924a (primary), --slate-blue, --emerald, etc.
 * - Status badges: text-label + color dot (Bryan's preference).
 */

export const layout = {
  page: { maxWidth: 1200, margin: '0 auto', padding: 24 } as CSSProperties,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap' as const, gap: 12 } as CSSProperties,
  row: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const } as CSSProperties,
  grid: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' } as CSSProperties,
  board: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(4, minmax(260px, 1fr))', overflowX: 'auto' as const } as CSSProperties,
  column: { minWidth: 260 } as CSSProperties,
}

export const panel = {
  container: { backgroundColor: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 24 } as CSSProperties,
  compact: { backgroundColor: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 16 } as CSSProperties,
  header: { marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--panel-border)' } as CSSProperties,
}

export const typeography = {
  title: { fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 24px', lineHeight: 1.2 } as CSSProperties,
  subtitle: { fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 16px', lineHeight: 1.2 } as CSSProperties,
  muted: { color: 'var(--fg-dim)', fontSize: 14, fontWeight: 400, lineHeight: 1.5 } as CSSProperties,
  small: { color: 'var(--fg-dim)', fontSize: 12, fontWeight: 400, lineHeight: 1.5 } as CSSProperties,
}

export const forms = {
  label: { display: 'block', color: 'var(--fg-dim)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  input: { width: '100%', backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 12px' } as CSSProperties,
  select: { width: '100%', backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 12px' } as CSSProperties,
  textarea: { width: '100%', backgroundColor: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 12px', minHeight: 80, resize: 'vertical' as const } as CSSProperties,
  group: { display: 'flex', flexDirection: 'column' as const, gap: 6 } as CSSProperties,
  row: { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } as CSSProperties,
}

export const buttons = {
  primary: { backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, transition: 'opacity .2s, box-shadow .2s', cursor: 'pointer' } as CSSProperties,
  secondary: { backgroundColor: 'transparent', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 16px', fontWeight: 500, cursor: 'pointer' } as CSSProperties,
  danger: { backgroundColor: 'transparent', color: 'var(--rust)', border: '1px solid var(--rust)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' } as CSSProperties,
  small: { backgroundColor: 'var(--panel-elevated)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' } as CSSProperties,
}

export const table = {
  table: { width: '100%', borderCollapse: 'collapse' as const } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontWeight: 600 } as CSSProperties,
  td: { padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14, fontWeight: 400 } as CSSProperties,
  tr: { transition: 'background .15s' } as CSSProperties,
}

/**
 * Status badge — color-coded background + text label.
 * Includes a small color dot for visual scanning (Bryan's preference:
 * text labels alongside color indicators, never color alone).
 */
export const statusBadge = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: `${color}22`,
  color,
  border: `1px solid ${color}44`,
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.2,
})

/** Colored dot for use inside status badges — 6px circle. */
export const statusDot = (color: string): CSSProperties => ({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  backgroundColor: color,
  flexShrink: 0,
})

// ── Responsive class name constants for use with CSS media queries ──
export const responsiveClassNames = {
  projectGrid: 'project-grid',
  statGrid: 'stat-grid',
  formGrid: 'form-grid',
  tableWrapper: 'table-wrapper',
  kanbanBoard: 'kanban-board',
  kanbanBoardScroll: 'kanban-board-scroll',
  kanbanColumn: 'kanban-column',
  panelContainer: 'panel-container',
  modalOverlay: 'modal-overlay',
  modalContent: 'modal-content',
}