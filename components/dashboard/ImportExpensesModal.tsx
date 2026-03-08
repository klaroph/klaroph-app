'use client'

import ImportCSVModal from '@/components/dashboard/ImportCSVModal'

type ImportExpensesModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

/** Wrapper for backward compatibility. Prefer ImportCSVModal with mode="expense". */
export default function ImportExpensesModal({ isOpen, onClose, onSuccess }: ImportExpensesModalProps) {
  return (
    <ImportCSVModal
      mode="expense"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  )
}
