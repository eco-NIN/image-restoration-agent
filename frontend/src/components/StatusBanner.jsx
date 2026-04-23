const statusStyles = {
  idle: 'border-slate-200 bg-slate-50 text-slate-700',
  uploading: 'border-blue-200 bg-blue-50 text-blue-800',
  inferencing: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

export default function StatusBanner({ status = 'idle', message }) {
  if (!message) return null

  const style = statusStyles[status] ?? statusStyles.idle
  const showSpinner = status === 'uploading' || status === 'inferencing'

  return (
    <div className={[
      'rounded-md border p-3 text-sm shadow-sm',
      style,
    ].join(' ')}>
      <div className="flex items-center gap-2">
        {showSpinner ? (
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin motion-reduce:animate-none"
          />
        ) : null}
        <span>{message}</span>
      </div>
    </div>
  )
}
