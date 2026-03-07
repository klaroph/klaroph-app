'use client'

/**
 * KlaroPH logo: magnifying glass with lens forming a rising financial graph.
 * Minimalist, flat, geometric. White primary, subtle gold/yellow, red highlight.
 * Suitable for SaaS and app icon. No gradients, no 3D.
 */
export default function KlaroPHEyeLogo({
  size = 40,
  className,
  variant = 'default',
}: {
  size?: number
  className?: string
  variant?: 'default' | 'light'
}) {
  const isLight = variant === 'light'
  const primary = isLight ? 'rgba(255,255,255,0.95)' : '#1a1a2e'
  const accent = isLight ? '#FCD116' : '#FCD116'
  const highlight = isLight ? 'rgba(206,17,38,0.9)' : '#CE1126'

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="KlaroPH"
      className={className}
    >
      {/* Magnifying glass circle (lens) */}
      <circle
        cx="26"
        cy="22"
        r="12"
        stroke={primary}
        strokeWidth="2.25"
        fill="none"
      />
      {/* Rising graph inside lens - financial chart */}
      <path
        d="M18 26 L22 24 L26 20 L30 16 L34 14"
        stroke={highlight}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Small dot at graph end */}
      <circle cx="34" cy="14" r="1.8" fill={accent} />
      {/* Handle */}
      <path
        d="M36 24 L44 32"
        stroke={primary}
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  )
}
