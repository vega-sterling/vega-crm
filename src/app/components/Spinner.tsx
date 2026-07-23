'use client'

export default function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <circle
        cx={12}
        cy={12}
        r={10}
        stroke="var(--fg-dim)"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray="40 60"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="1s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}
