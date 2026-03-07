'use client'

import { useState } from 'react'

type ButtonProps = {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
  style?: React.CSSProperties
}

export default function Button({
  children,
  onClick,
  type = 'button',
  disabled = false,
  variant = 'primary',
  style = {},
}: ButtonProps) {
  const [hover, setHover] = useState(false)

  const base: React.CSSProperties = {
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s ease',
  }

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--text-inverse)',
      boxShadow: '0 2px 8px var(--color-primary-shadow)',
      opacity: disabled ? 1 : hover ? 0.92 : 1,
    },
    secondary: {
      backgroundColor: 'var(--surface)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
      opacity: disabled ? 1 : hover ? 0.9 : 1,
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-secondary)',
      opacity: disabled ? 1 : hover ? 0.85 : 1,
    },
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  )
}
