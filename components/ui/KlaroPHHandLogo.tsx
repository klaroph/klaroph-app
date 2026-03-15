'use client'

import Image from 'next/image'

/**
 * KlaroPH logo: uses brand assets from public/
 * - logo-klaroph-white.png → used when variant="onBlue" (blue/dark backgrounds)
 * - logo-klaroph-blue.png  → used when variant="onWhite" (white/light backgrounds)
 */
export default function KlaroPHHandLogo({
  size = 32,
  variant = 'onWhite',
  showText = true,
  priority = false,
  className,
}: {
  size?: number
  /** onBlue = white logo (for blue/dark bg); onWhite = blue logo (for white/light bg) */
  variant?: 'onBlue' | 'onWhite'
  showText?: boolean
  /** Set true for above-the-fold logo (e.g. landing nav) to improve LCP */
  priority?: boolean
  className?: string
}) {
  const isWhiteLogo = variant === 'onBlue'
  const src = isWhiteLogo ? '/logo-klaroph-white.png' : '/logo-klaroph-blue.png'
  const height = size
  const width = showText ? Math.round(size * 3.6) : size

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height,
        lineHeight: 1,
      }}
      aria-label="KlaroPH"
    >
      <Image
        src={src}
        alt=""
        width={width}
        height={height}
        priority={priority}
        sizes={showText ? '(max-width: 900px) 120px, 202px' : `${size}px`}
        style={{
          width: showText ? width : size,
          height: size,
          objectFit: 'contain',
          objectPosition: 'left center',
          flexShrink: 0,
        }}
        draggable={false}
      />
    </span>
  )
}
