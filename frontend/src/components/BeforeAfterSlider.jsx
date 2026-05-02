import { useMemo, useRef, useState } from 'react'

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt = '处理前',
  afterAlt = '处理后',
  disabled = false,
}) {
  // 关键状态：滑块位置（0-100）
  const [percent, setPercent] = useState(50)
  const containerRef = useRef(null)

  const clipStyle = useMemo(() => {
    return {
      clipPath: `inset(0 ${100 - percent}% 0 0)`,
    }
  }, [percent])

  function setFromClientX(clientX) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
    const next = Math.round((x / rect.width) * 100)
    setPercent(next)
  }

  const isReady = Boolean(beforeSrc && afterSrc)

  return (
    <section aria-label="复原结果对比" className="space-y-3">
      <div
        ref={containerRef}
        className={[
          'relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-gradient-to-br from-slate-100 via-white to-slate-100 shadow-sm',
          disabled ? 'opacity-60' : 'border-slate-300',
        ].join(' ')}
        onPointerDown={(e) => {
          if (disabled || !isReady) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          setFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (disabled || !isReady) return
          if (e.buttons !== 1) return
          setFromClientX(e.clientX)
        }}
      >
        {!isReady ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-sm text-slate-600">请先完成一次处理以生成对比视图</p>
          </div>
        ) : (
          <>
            <img
              src={afterSrc}
              alt={afterAlt}
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />

            <img
              src={beforeSrc}
              alt={beforeAlt}
              className="absolute inset-0 h-full w-full object-contain"
              style={clipStyle}
              draggable={false}
            />

            {/* 竖向分割线 */}
            <div
              className="absolute inset-y-0 w-0.5 bg-white/95 shadow-[0_0_12px_rgba(255,255,255,0.9)]"
              style={{ left: `${percent}%` }}
              aria-hidden="true"
            />

            {/* 拖动手柄（视觉） */}
            <div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${percent}%` }}
              aria-hidden="true"
            >
              <div className="-translate-x-1/2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md">
                {percent}%
              </div>
            </div>

            {/* 范围输入：用于键盘无障碍与移动端 */}
            <input
              type="range"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="absolute inset-x-3 bottom-3 accent-blue-600"
              aria-label="对比滑块"
            />

            <div className="absolute left-3 top-3 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm">
              处理前
            </div>
            <div className="absolute right-3 top-3 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm">
              处理后
            </div>
          </>
        )}
      </div>

    </section>
  )
}
