'use client'

// ============================================================================
// File: src/app/components/Avatar.tsx
// Description: Colored initials circle — avatar fallback for contacts.
//              Color is derived from a name hash for consistent per-person
//              coloring. Phase 1: Add colored initials circles to Contacts.
// ============================================================================

/**
 * Hash a string to a number — simple deterministic hash for color selection.
 * Used to assign a consistent color to each person based on their name.
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0 // Convert to 32-bit integer
  }
  return Math.abs(hash)
}

/**
 * Curated avatar color palette — muted, premium tones that complement
 * the app's color scheme. No high-saturation colors.
 */
const AVATAR_COLORS = [
  '#4a6b8a', // slate blue
  '#5a8a5a', // sage green
  '#b8924a', // deep gold
  '#7a6b9a', // muted violet
  '#4a8a8a', // muted teal
  '#b8504a', // muted terracotta
  '#8a7a4a', // warm bronze
  '#6a8a6a', // sage
  '#9a6b6a', // muted rose
  '#5a7a9a', // dusty blue
]

interface AvatarProps {
  name: string
  size?: number
}

/**
 * Avatar — renders a colored circle with the first letter of the name.
 * Color is deterministically derived from the name hash so each person
 * always gets the same color. Font size scales with circle size.
 */
export default function Avatar({ name, size = 36 }: AvatarProps) {
  const trimmed = name.trim()
  const initial = trimmed.charAt(0).toUpperCase() || '?'
  const colorIndex = hashString(trimmed || '?') % AVATAR_COLORS.length
  const bgColor = AVATAR_COLORS[colorIndex]
  const fontSize = Math.round(size * 0.4)

  return (
    <div
      className="vega-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bgColor,
        fontSize,
        lineHeight: 1,
      }}
      aria-hidden="true"
      role="presentation"
    >
      {initial}
    </div>
  )
}

export { hashString, AVATAR_COLORS }