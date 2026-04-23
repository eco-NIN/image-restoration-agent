export default function Alert({ title = '错误', message }) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="rounded-md border border-rose-200 bg-rose-50 p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2 w-2 flex-none rounded-full bg-rose-600" />
        <div>
          <p className="text-sm font-semibold text-rose-900">{title}</p>
          <p className="mt-1 text-sm text-rose-800 whitespace-pre-wrap">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
