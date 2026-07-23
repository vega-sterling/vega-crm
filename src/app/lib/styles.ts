import type { CSSProperties } from 'react'

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
  title: { fontSize: 28, fontWeight: 700, margin: '0 0 24px' } as CSSProperties,
  subtitle: { fontSize: 18, fontWeight: 600, margin: '0 0 16px' } as CSSProperties,
  muted: { color: 'var(--fg-dim)', fontSize: 14 } as CSSProperties,
  small: { color: 'var(--fg-dim)', fontSize: 12 } as CSSProperties,
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
  primary: { backgroundColor: 'var(--gold)', color: 'var(--bg)', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, transition: 'opacity .2s' } as CSSProperties,
  secondary: { backgroundColor: 'transparent', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 8, padding: '10px 16px', fontWeight: 500 } as CSSProperties,
  danger: { backgroundColor: 'transparent', color: 'var(--rust)', border: '1px solid var(--rust)', borderRadius: 8, padding: '8px 12px' } as CSSProperties,
  small: { backgroundColor: 'var(--panel-elevated)', color: 'var(--fg)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: '6px 10px', fontSize: 12 } as CSSProperties,
}

export const table = {
  table: { width: '100%', borderCollapse: 'collapse' as const } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', color: 'var(--fg-dim)', fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  td: { padding: '12px 8px', borderBottom: '1px solid var(--panel-border)', fontSize: 14 } as CSSProperties,
  tr: { transition: 'background .2s' } as CSSProperties,
}

export const statusBadge = (color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  backgroundColor: `${color}22`,
  color,
  border: `1px solid ${color}44`,
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 600,
})
