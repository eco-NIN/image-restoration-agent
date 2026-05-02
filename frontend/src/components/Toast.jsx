import { useEffect } from 'react'

export default function Toast({ open, message, type = 'error', onClose }) {
  useEffect(() => {
    if (!open) return undefined
    const t = window.setTimeout(() => onClose?.(), 2600)
    return () => window.clearTimeout(t)
  }, [open, onClose])

  if (!open || !message) return null

  const color =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-rose-200 bg-rose-50 text-rose-800'

  return (
    <div className="fixed right-4 top-4 z-[100] motion-safe:animate-fadeIn">
      <div className={["rounded-xl border px-4 py-3 text-sm shadow-lg", color].join(' ')}>{message}</div>
    </div>
  )
}
