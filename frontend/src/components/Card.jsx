export default function Card({ className = '', children, ...props }) {
  return (
    <section
      className={[
        'rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-[0_6px_24px_-16px_rgba(15,23,42,0.3)] backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)] motion-safe:animate-fadeUp',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </section>
  )
}
