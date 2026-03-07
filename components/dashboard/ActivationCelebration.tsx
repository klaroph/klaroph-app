'use client'

import { useEffect, useRef, useState } from 'react'

const PRO_ACTIVATED_KEY = 'pro_activated_shown'

function runConfetti(canvas: HTMLCanvasElement, durationMs: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const colors = ['#0038a8', '#d4af37', '#fff', '#e6e9ef']
  const particles: Array<{
    x: number
    y: number
    vx: number
    vy: number
    size: number
    color: string
  }> = []
  const count = 60
  const w = canvas.width
  const h = canvas.height

  for (let i = 0; i < count; i++) {
    particles.push({
      x: w / 2,
      y: h / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.6) * 10,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }

  const start = Date.now()
  function frame() {
    if (!ctx) return
    const elapsed = Date.now() - start
    if (elapsed >= durationMs) return
    ctx.clearRect(0, 0, w, h)
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.2
      p.vx *= 0.99
      p.vy *= 0.99
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

type Props = {
  isPro: boolean
  onShown?: () => void
}

export default function ActivationCelebration({ isPro, onShown }: Props) {
  const [showToast, setShowToast] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !isPro || doneRef.current) return
    if (window.localStorage.getItem(PRO_ACTIVATED_KEY)) return

    doneRef.current = true
    window.localStorage.setItem(PRO_ACTIVATED_KEY, '1')
    setShowToast(true)

    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      runConfetti(canvas, 2600)
    }

    const t = setTimeout(() => {
      setShowToast(false)
      onShown?.()
    }, 3000)
    return () => clearTimeout(t)
  }, [isPro, onShown])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      />
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            padding: '14px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-lg)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          🎉 Welcome to KlaroPH Pro!
        </div>
      )}
    </>
  )
}
