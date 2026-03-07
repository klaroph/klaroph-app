'use client'

import { useEffect } from 'react'

export default function LoginRedirect() {
  useEffect(() => {
    window.location.href = '/#login'
  }, [])

  return (
    <div style={{
      minHeight: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontSize: 14,
    }}>
      Redirecting...
    </div>
  )
}
