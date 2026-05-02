import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, StopCircle, Trash2, X } from 'lucide-react'

import Alert from '../components/Alert.jsx'
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx'
import { Button } from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import {
  cancelTask,
  deleteHistoryGroup,
  deleteHistoryTask,
  fetchHistory,
  fetchTaskStatus,
  resolveApiAssetUrl,
} from '../services/apiClient.js'
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
        'inline-flex min-w-[52px] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium',
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

function normalizeEntryStatus(entry) {
  if (!entry) return 'unknown'
  if (entry.entryType === 'folder' || entry.entryType === 'batch') {
    const children = Array.isArray(entry.items) ? entry.items : []
    if (!children.length) return entry.status || 'unknown'
    if (children.some((child) => child.status === 'running' || child.status === 'cancelling')) return 'running'
    if (children.every((child) => child.status === 'done')) return 'done'
    if (children.some((child) => child.status === 'failed')) return 'failed'
    if (children.some((child) => child.status === 'cancelled')) return 'cancelled'
    return entry.status || 'unknown'
  }
  return entry.status || 'unknown'
}

export default function HistoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [expandedGroups, setExpandedGroups] = useState({})
  const [viewerTask, setViewerTask] = useState(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState({})
  const [batchDeleting, setBatchDeleting] = useState(false)

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
      setSelectedIds({})
    } catch (e) {
      setErrorMessage(e?.message || '获取历史记录失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    if (viewerTask || viewerLoading) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevOverflow
      }
    }
    return undefined
  }, [viewerTask, viewerLoading])

  const filteredItems = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase()
    return items.filter((it) => {
      const status = normalizeEntryStatus(it)
      if (statusFilter !== 'all' && status !== statusFilter) {
        return false
      }

      if (!keywordText) return true

      const pool = [
        it.id,
        it.taskId,
        it.groupName,
        it.fileName,
        it.mode,
        it.createdAt,
      ]

      if (Array.isArray(it.items)) {
        it.items.forEach((child) => {
          pool.push(child.id, child.taskId, child.fileName, child.relativePath, child.mode)
        })
      }

      return pool
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .some((v) => v.includes(keywordText))
    })
  }, [items, keyword, statusFilter])

  const selectedEntryIds = useMemo(
    () => Object.entries(selectedIds).filter(([, checked]) => checked).map(([id]) => id),
    [selectedIds]
  )

  const allFilteredSelected = useMemo(() => {
    if (!filteredItems.length) return false
    return filteredItems.every((it) => selectedIds[it.id])
  }, [filteredItems, selectedIds])

  function toggleGroup(groupId) {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  function toggleItemSelection(entryId) {
    setSelectedIds((prev) => ({
      ...prev,
      [entryId]: !prev[entryId],
    }))
  }

  function toggleSelectFiltered(checked) {
    setSelectedIds((prev) => {
      const next = { ...prev }
      filteredItems.forEach((it) => {
        next[it.id] = checked
      })
      return next
    })
  }

  async function handleCancel(taskId) {
    if (!taskId) return
    try {
      await cancelTask(taskId)
      await loadHistory()
      window.setTimeout(() => loadHistory(), 1500)
    } catch (e) {
      setErrorMessage(e?.message || '取消任务失败')
    }
  }

  async function handleDeleteEntry(entry) {
    if (!entry?.id) return
    const targetLabel = entry.entryType === 'folder' || entry.entryType === 'batch' ? entry.groupName || entry.id : entry.fileName || entry.id
    const ok = window.confirm(`确认删除历史记录：${targetLabel}？\n该操作会清理数据库记录及运行时文件。`)
    if (!ok) return

    try {
      if (entry.entryType === 'folder' || entry.entryType === 'batch') {
        await deleteHistoryGroup(entry.id)
      } else {
        await deleteHistoryTask(entry.taskId || entry.id)
      }
      await loadHistory()
    } catch (e) {
      setErrorMessage(e?.message || '删除历史记录失败')
    }
  }

  async function handleDeleteSelected() {
    if (!selectedEntryIds.length) return
    const ok = window.confirm(`确认删除已选中的 ${selectedEntryIds.length} 条历史记录？\n该操作不可撤销。`)
    if (!ok) return

    setBatchDeleting(true)
    setErrorMessage('')
    let deletedCount = 0
    try {
      const selectedItems = items.filter((it) => selectedIds[it.id])
      for (const entry of selectedItems) {
        if (entry.entryType === 'folder' || entry.entryType === 'batch') {
          await deleteHistoryGroup(entry.id)
        } else {
          await deleteHistoryTask(entry.taskId || entry.id)
        }
        deletedCount += 1
      }
      await loadHistory()
      if (deletedCount > 0) {
        setErrorMessage('')
      }
    } catch (e) {
      setErrorMessage(e?.message || '批量删除失败')
    } finally {
      setBatchDeleting(false)
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
      <PageHeader title="历史记录" />

      <Card className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_150px_auto_auto] lg:items-center">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="筛选：任务ID / 文件名 / 批次名"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">全部状态</option>
              <option value="done">完成</option>
              <option value="running">处理中</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>

            <Button variant="secondary" onClick={() => loadHistory()}>
              刷新列表
            </Button>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={(e) => toggleSelectFiltered(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              全选当前筛选
            </label>

            <Button
              variant="danger"
              onClick={handleDeleteSelected}
              disabled={!selectedEntryIds.length || batchDeleting}
              className="whitespace-nowrap"
            >
              <Trash2 size={14} className="mr-1" />
              删除已选({selectedEntryIds.length})
            </Button>
          </div>
        </div>

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

        {!loading && !errorMessage && filteredItems.length > 0 ? (
          <div className="space-y-3">
            {filteredItems.map((it) => {
              const isGroup = it.entryType === 'folder' || it.entryType === 'batch'
              if (!isGroup) {
                return (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr_auto_1fr] md:items-center">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedIds[it.id])}
                          onChange={() => toggleItemSelection(it.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openViewer(it.taskId || it.id)}
                          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          {renderThumb(it.thumbnailUrl)}
                        </button>
                        <div>
                          <p className="line-clamp-1 text-sm font-semibold text-slate-900">{it.fileName || '-'}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">{String(it.taskId || it.id)}</p>
                        </div>
                      </div>
                      <p className="text-center text-xs text-slate-500">{formatDateTime(it.createdAt)}</p>
                      <div className="flex flex-wrap items-center justify-end gap-2 md:pr-6">
                        <StatusPill status={it.status} />
                        {!isTerminalStatus(it.status) ? (
                          <Button
                            variant="danger"
                            className="px-2 py-1 text-xs"
                            onClick={() => handleCancel(it.taskId || it.id)}
                          >
                            <StopCircle size={14} className="mr-1" />
                            结束
                          </Button>
                        ) : null}
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => handleDeleteEntry(it)}>
                          <Trash2 size={14} className="mr-1" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              }

              const open = expandedGroups[it.id] ?? false
              return (
                <div key={it.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[auto_1fr_auto_1fr]">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[it.id])}
                        onChange={() => toggleItemSelection(it.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </div>

                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => toggleGroup(it.id)}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Folder size={16} className="text-slate-700" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {it.entryType === 'folder' ? '文件夹批次' : '批量任务'}：{it.groupName || it.id}
                        </p>
                        <p className="text-xs text-slate-500">
                          {it.count || 0} 张 | {formatDateTime(it.createdAt)}
                        </p>
                      </div>
                    </button>

                    <p className="text-center text-xs text-slate-500">{formatDateTime(it.createdAt)}</p>

                    <div className="flex items-center justify-end gap-2 md:pr-6">
                      <StatusPill status={normalizeEntryStatus(it)} />
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => handleDeleteEntry(it)}>
                        <Trash2 size={14} className="mr-1" />
                        删除批次
                      </Button>
                    </div>
                  </div>

                  {open ? (
                    <div className="space-y-2 border-t border-slate-100 p-3">
                      {(it.items || []).map((child) => (
                        <div
                          key={child.id}
                          className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1fr_auto_1fr] md:items-center"
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => openViewer(child.taskId || child.id)}
                              className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            >
                              {renderThumb(child.thumbnailUrl)}
                            </button>
                            <div>
                              <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                                {child.relativePath || child.fileName}
                              </p>
                              <p className="mt-1 font-mono text-xs text-slate-500">{child.taskId || child.id}</p>
                            </div>
                          </div>
                          <p className="text-center text-xs text-slate-500">{formatDateTime(child.createdAt)}</p>
                          <div className="flex flex-wrap items-center justify-end gap-2 md:pr-6">
                            <StatusPill status={child.status} />
                            {!isTerminalStatus(child.status) ? (
                              <Button
                                variant="danger"
                                className="px-2 py-1 text-xs"
                                onClick={() => handleCancel(child.taskId || child.id)}
                              >
                                结束
                              </Button>
                            ) : null}
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

        {!loading && !errorMessage && items.length > 0 && filteredItems.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">当前筛选条件下无记录。</p>
            <p className="mt-1 text-xs text-slate-500">可调整关键词或状态筛选后重试。</p>
          </div>
        ) : null}
      </Card>

      {viewerTask || viewerLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-[min(900px,92vw)] rounded-xl border border-slate-300 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">
                {viewerTask?.fileName || viewerTask?.taskId || '加载中'}
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
              <BeforeAfterSlider
                beforeSrc={resolveApiAssetUrl(viewerTask?.inputImageUrl || '')}
                afterSrc={resolveApiAssetUrl(viewerTask?.resultImageUrl || '')}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
