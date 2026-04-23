export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

  const styles =
    variant === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
      : variant === 'danger'
        ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm'
        : variant === 'secondary'
          ? 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 hover:text-slate-900'
          : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 hover:text-slate-900'

  return <button className={[base, styles, className].join(' ')} {...props} />
}
