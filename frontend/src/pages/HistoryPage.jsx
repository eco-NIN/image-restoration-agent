import { useEffect, useMemo, useState } from 'react'

import Alert from '../components/Alert.jsx'
import Card from '../components/Card.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import { fetchHistory } from '../services/apiClient.js'
import { formatDateTime } from '../utils/time.js'

function HistorySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div
          key={idx}
          className="grid grid-cols-12 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="col-span-2 h-10 rounded bg-slate-200 motion-safe:animate-pulseSoft" />
          <div className="col-span-3 h-4 rounded bg-slate-200 motion-safe:animate-pulseSoft" />
          <div className="col-span-2 h-4 rounded bg-slate-200 motion-safe:animate-pulseSoft" />
          <div className="col-span-2 h-4 rounded bg-slate-200 motion-safe:animate-pulseSoft" />
          <div className="col-span-3 h-4 rounded bg-slate-200 motion-safe:animate-pulseSoft" />
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }) {
  const styles =
    status === 'done'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'running'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : status === 'failed'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-slate-50 text-slate-700 border-slate-200'

  const label =
    status === 'done'
      ? '完成'
      : status === 'running'
        ? '处理中'
        : status === 'failed'
          ? '失败'
          : '未知'

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        styles,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

export default function HistoryPage() {
  // 关键状态：历史任务数据、加载态、错误态
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const empty = useMemo(() => !loading && !errorMessage && items.length === 0, [
    items.length,
    loading,
    errorMessage,
  ])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setErrorMessage('')
      try {
        const data = await fetchHistory()
        if (cancelled) return
        setItems(Array.isArray(data) ? data : [])
      } catch (e) {
        if (cancelled) return
        setErrorMessage(e?.message || '获取历史记录失败')
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 motion-safe:animate-fadeIn">
      <PageHeader
        title="历史记录"
        description="展示历史任务列表（缩略图、任务 ID、处理模式、状态与创建时间）。"
      />

      <Card className="space-y-4">
        {loading ? (
          <>
            <StatusBanner status="uploading" message="正在获取历史任务列表…" />
            <HistorySkeleton />
          </>
        ) : null}
        <Alert title="加载失败" message={errorMessage} />

        {empty ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">暂无历史记录。</p>
            <p className="mt-1 text-xs text-slate-500">
              可在完成一次处理后，由后端写入并在此处返回。
            </p>
          </div>
        ) : null}

        {!loading && !errorMessage && items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full border-separate border-spacing-0 bg-white">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    缩略图
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    任务 ID
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    模式
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    状态
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    创建时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="h-12 w-16 overflow-hidden rounded border border-slate-200 bg-slate-100">
                        {it.thumbnailUrl ? (
                          <img
                            src={it.thumbnailUrl}
                            alt="缩略图"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 font-mono text-xs text-slate-800">
                      {String(it.id)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {it.mode || '-'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <StatusPill status={it.status} />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-xs text-slate-600">
                      {formatDateTime(it.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="text-xs text-slate-500">
          预留接口：GET /api/history（字段可按后端实际返回调整）。
        </div>
      </Card>
    </div>
  )
}
