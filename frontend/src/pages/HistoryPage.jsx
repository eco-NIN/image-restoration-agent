import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, Image as ImageIcon, StopCircle, X } from 'lucide-react'

import Alert from '../components/Alert.jsx'
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx'
import { Button } from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import { cancelTask, fetchHistory, fetchTaskStatus, resolveApiAssetUrl } from '../services/apiClient.js'
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
        : status === 'cancelling'
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : status === 'cancelled'
            ? 'bg-slate-100 text-slate-700 border-slate-300'
            : status === 'failed'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'

  const label =
    status === 'done'
      ? '完成'
      : status === 'running'
        ? '处理中'
        : status === 'cancelling'
          ? '取消中'
          : status === 'cancelled'
            ? '已取消'
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

function isTerminalStatus(status) {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [expandedGroups, setExpandedGroups] = useState({})
  const [viewerTask, setViewerTask] = useState(null)
  const [viewerLoading, setViewerLoading] = useState(false)

  const empty = useMemo(() => !loading && !errorMessage && items.length === 0, [
    items.length,
    loading,
    errorMessage,
  ])

  async function loadHistory() {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await fetchHistory()
      const next = Array.isArray(data) ? data : []
      setItems(next)
      setExpandedGroups((prev) => {
        const draft = { ...prev }
        next.forEach((item) => {
          if ((item.entryType === 'folder' || item.entryType === 'batch') && !(item.id in draft)) {
            draft[item.id] = false
          }
        })
        return draft
      })
    } catch (e) {
      setErrorMessage(e?.message || '获取历史记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  function toggleGroup(groupId) {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  async function handleCancel(taskId) {
    if (!taskId) return
    try {
      await cancelTask(taskId)
      await loadHistory()
    } catch (e) {
      setErrorMessage(e?.message || '取消任务失败')
    }
  }

  async function openViewer(taskId) {
    if (!taskId) return
    setViewerLoading(true)
    try {
      const detail = await fetchTaskStatus(taskId)
      setViewerTask(detail)
    } catch (e) {
      setErrorMessage(e?.message || '加载任务详情失败')
    } finally {
      setViewerLoading(false)
    }
  }

  function renderThumb(url) {
    return (
      <div className="h-12 w-16 overflow-hidden rounded border border-slate-200 bg-slate-100">
        {url ? <img src={resolveApiAssetUrl(url)} alt="缩略图" className="h-full w-full object-cover" /> : null}
      </div>
    )
  }

  return (
    <div className="space-y-6 motion-safe:animate-fadeIn">
      <PageHeader
        title="历史记录"
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
            <p className="mt-1 text-xs text-slate-500">可在完成一次处理后刷新查看。</p>
          </div>
        ) : null}

        {!loading && !errorMessage && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((it) => {
              const isGroup = it.entryType === 'folder' || it.entryType === 'batch'
              if (!isGroup) {
                return (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
                      <div className="md:col-span-2">{renderThumb(it.thumbnailUrl)}</div>
                      <div className="md:col-span-3">
                        <p className="text-xs text-slate-500">任务 ID</p>
                        <p className="font-mono text-xs text-slate-800">{String(it.taskId || it.id)}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-xs text-slate-500">文件</p>
                        <p className="line-clamp-2 text-xs text-slate-700">{it.fileName || '-'}</p>
                      </div>
                      <div className="md:col-span-1">
                        <StatusPill status={it.status} />
                      </div>
                      <div className="md:col-span-2 text-xs text-slate-600">
                        {formatDateTime(it.createdAt)}
                      </div>
                      <div className="md:col-span-2 flex flex-wrap justify-start gap-2 md:justify-end">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => openViewer(it.taskId || it.id)}
                        >
                          放大查看
                        </Button>
                        <Button
                          variant="danger"
                          className="px-2 py-1 text-xs"
                          onClick={() => handleCancel(it.taskId || it.id)}
                          disabled={isTerminalStatus(it.status)}
                        >
                          <StopCircle size={14} className="mr-1" />
                          结束
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              }

              const open = expandedGroups[it.id] ?? false
              return (
                <div key={it.id} className="rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-3"
                    onClick={() => toggleGroup(it.id)}
                  >
                    <div className="flex items-center gap-2 text-left">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Folder size={16} className="text-slate-700" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {it.entryType === 'folder' ? '文件夹批次' : '批量任务'}
                          ：{it.groupName || it.id}
                        </p>
                        <p className="text-xs text-slate-500">
                          {it.count || 0} 张 | {formatDateTime(it.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={it.status} />
                    </div>
                  </button>

                  {open ? (
                    <div className="space-y-2 border-t border-slate-100 p-3">
                      {(it.items || []).map((child) => (
                        <div
                          key={child.id}
                          className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-12 md:items-center"
                        >
                          <div className="md:col-span-2">{renderThumb(child.thumbnailUrl)}</div>
                          <div className="md:col-span-3">
                            <p className="font-mono text-xs text-slate-800">{child.taskId || child.id}</p>
                            <p className="line-clamp-2 text-xs text-slate-600">{child.relativePath || child.fileName}</p>
                          </div>
                          <div className="md:col-span-2 text-xs text-slate-600">{child.mode || '-'}</div>
                          <div className="md:col-span-1">
                            <StatusPill status={child.status} />
                          </div>
                          <div className="md:col-span-2 text-xs text-slate-600">
                            {formatDateTime(child.createdAt)}
                          </div>
                          <div className="md:col-span-2 flex flex-wrap justify-start gap-2 md:justify-end">
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-xs"
                              onClick={() => openViewer(child.taskId || child.id)}
                            >
                              放大查看
                            </Button>
                            <Button
                              variant="danger"
                              className="px-2 py-1 text-xs"
                              onClick={() => handleCancel(child.taskId || child.id)}
                              disabled={isTerminalStatus(child.status)}
                            >
                              结束
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}

      </Card>

      {(viewerTask || viewerLoading) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[92vh] w-[min(1200px,96vw)] overflow-auto rounded-xl border border-slate-300 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ImageIcon size={16} />
                放大查看：{viewerTask?.fileName || viewerTask?.taskId || '加载中'}
              </div>
              <button
                type="button"
                className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setViewerTask(null)}
              >
                <X size={18} />
              </button>
            </div>

            {viewerLoading ? (
              <StatusBanner status="uploading" message="正在加载任务详情..." />
            ) : (
              <div className="space-y-3">
                <BeforeAfterSlider
                  beforeSrc={resolveApiAssetUrl(viewerTask?.inputImageUrl || '')}
                  afterSrc={resolveApiAssetUrl(viewerTask?.resultImageUrl || '')}
                />
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">任务信息</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">{viewerTask?.taskId}</p>
                  <p className="mt-1 text-xs text-slate-600">状态：{viewerTask?.status}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}