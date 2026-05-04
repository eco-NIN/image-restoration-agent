import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Folder,
  FolderOpen,
  Settings2,
  StopCircle,
  WandSparkles,
  X,
} from 'lucide-react'

import Alert from '../components/Alert.jsx'
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx'
import { Button } from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import FileDropzone from '../components/FileDropzone.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import {
  cancelTask,
  fetchTaskStatus,
  resolveApiAssetUrl,
  submitRestoreBatchTask,
  submitRestoreTask,
} from '../services/apiClient.js'
import { downloadByUrl } from '../utils/download.js'

const WORKBENCH_RUNTIME_KEY = 'workbench_runtime_v2'

const RESTORE_MODES = [
  { value: 'MyAgent_API', label: 'MyAgent_API（默认）' },
  { value: 'FastGen4K_P', label: 'FastGen4K_P（快速 4K 超分）' },
  { value: 'Gen4K_P', label: 'Gen4K_P（通用 4K 超分/感知偏好）' },
  { value: 'GenMIR_P', label: 'GenMIR_P（多退化图像复原）' },
  { value: 'GenSR_s4_P', label: 'GenSR_s4_P（通用超分 x4/感知偏好）' },
  { value: 'GenSRFR_s4_P', label: 'GenSRFR_s4_P（超分 x4 + 人脸修复）' },
  { value: 'ExpSR_s4_P', label: 'ExpSR_s4_P（显式超分 x4/感知偏好）' },
  { value: 'ExpSR_s4_F', label: 'ExpSR_s4_F（显式超分 x4/保真偏好）' },
  { value: 'OldP4K_P', label: 'OldP4K_P（老照片 4K 修复）' },
  { value: 'denoise_sr_hpsv2_upscale4k_P', label: 'denoise_sr_hpsv2_upscale4k_P（去噪 + 4K 超分/感知偏好）' },
  { value: 'denoise_sr_hpsv2_upscale4k_F', label: 'denoise_sr_hpsv2_upscale4k_F（去噪 + 4K 超分/保真偏好）' },
  { value: 'general_llamaV_hpsv2_upscale4k_face_P', label: 'general_llamaV_hpsv2_upscale4k_face_P（通用 4K + 人脸修复）' },
]

function modeLabel(modeValue) {
  return RESTORE_MODES.find((m) => m.value === modeValue)?.label ?? modeValue
}

function jobStatusStyle(status) {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (status === 'failed') return 'bg-rose-100 text-rose-800 border-rose-200'
  if (status === 'cancelled') return 'bg-slate-200 text-slate-700 border-slate-300'
  if (status === 'cancelling') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (status === 'running') return 'bg-indigo-100 text-indigo-800 border-indigo-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function isTerminalStatus(status) {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

function normalizeFlowText(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
          .join('；')
      }
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
          .join('；')
      }
    } catch {
      // ignore parse error and fallback below
    }
  }

  return text.replace(/[{}\[\]"]/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim()
}

function summarizeFinalStatus(nextJobs) {
  const doneCount = nextJobs.filter((it) => it.status === 'done').length
  const failCount = nextJobs.filter((it) => it.status === 'failed').length
  const cancelCount = nextJobs.filter((it) => it.status === 'cancelled').length
  return `处理结束：成功 ${doneCount}，失败 ${failCount}，取消 ${cancelCount}`
}

function summarizeRunningStatus(nextJobs) {
  const cancellingCount = nextJobs.filter((it) => it.status === 'cancelling').length
  const runningCount = nextJobs.filter((it) => it.status === 'running' || it.status === 'queued').length
  if (cancellingCount > 0) return `正在取消任务：${cancellingCount} 个`
  if (runningCount > 0) return `云端 GPU 推理中：${runningCount} 个任务进行中`
  return '任务处理中，请稍候…'
}

function hasNonTerminalJobs(jobList) {
  return Array.isArray(jobList) && jobList.some((it) => !isTerminalStatus(it?.status))
}

function attemptStatusLabel(status) {
  if (status === 'completed') return '流程完成'
  if (status === 'done') return '本轮完成'
  if (status === 'rolled_back') return '已回滚'
  if (status === 'planned') return '已规划'
  return '执行中'
}

function attemptStatusStyle(status) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'done') return 'border-teal-200 bg-teal-50 text-teal-800'
  if (status === 'rolled_back') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'planned') return 'border-slate-200 bg-slate-100 text-slate-700'
  return 'border-indigo-200 bg-indigo-50 text-indigo-800'
}

function prettyTimestamp(raw) {
  const text = stripAnsi(raw || '')
  const match = text.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
  return match ? match[1] : text
}

function mergeFlowProgress(prevFlow, nextFlow) {
  if (!prevFlow) return nextFlow || null
  if (!nextFlow) return prevFlow

  const prevStages = Array.isArray(prevFlow.stages) ? prevFlow.stages : []
  const nextStages = Array.isArray(nextFlow.stages) ? nextFlow.stages : []
  const prevMap = new Map(prevStages.map((stage) => [stage.id, stage]))
  const mergedStages = nextStages.map((stage) => {
    const prevStage = prevMap.get(stage.id)
    return {
      ...stage,
      done: Boolean(stage.done || prevStage?.done),
      detail: stage.detail || prevStage?.detail || '',
    }
  })

  const mergedPlanHistory = Array.isArray(nextFlow.planHistory) && nextFlow.planHistory.length
    ? nextFlow.planHistory
    : Array.isArray(prevFlow.planHistory)
      ? prevFlow.planHistory
      : []

  const mergedAttempts = Array.isArray(nextFlow.attempts) && nextFlow.attempts.length
    ? nextFlow.attempts
    : Array.isArray(prevFlow.attempts)
      ? prevFlow.attempts
      : []

  return {
    ...prevFlow,
    ...nextFlow,
    stages: mergedStages,
    planHistory: mergedPlanHistory,
    attempts: mergedAttempts,
    planList:
      (Array.isArray(nextFlow.planList) && nextFlow.planList.length
        ? nextFlow.planList
        : Array.isArray(prevFlow.planList)
          ? prevFlow.planList
          : []),
    scoreLines:
      (Array.isArray(nextFlow.scoreLines) && nextFlow.scoreLines.length
        ? nextFlow.scoreLines
        : Array.isArray(prevFlow.scoreLines)
          ? prevFlow.scoreLines
          : []),
  }
}

export default function WorkbenchPage() {
  const [imageFiles, setImageFiles] = useState([])
  const [mode, setMode] = useState('MyAgent_API')

  const [errorMessage, setErrorMessage] = useState('')
  const [fileError, setFileError] = useState('')

  const [status, setStatus] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [batchId, setBatchId] = useState('')
  const [batchSourceType, setBatchSourceType] = useState('single')
  const [jobs, setJobs] = useState([])
  const [activeTaskId, setActiveTaskId] = useState('')

  const [isDownloading, setIsDownloading] = useState(false)
  const [previewUrls, setPreviewUrls] = useState([])
  const [expandedGroups, setExpandedGroups] = useState({})
  const [floatingCompareTaskId, setFloatingCompareTaskId] = useState('')
  const [floatingPos, setFloatingPos] = useState({ x: 120, y: 120 })

  const inFlightRef = useRef(false)
  const inferTimerRef = useRef(null)
  const pollingRef = useRef(null)
  const pollingBusyRef = useRef(false)
  const jobsRef = useRef([])
  const restoredRef = useRef(false)

  const dragStateRef = useRef({ active: false, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    if (!imageFiles.length) {
      setPreviewUrls([])
      return
    }

    const urls = imageFiles.map((file) => ({
      fileName: file.name,
      relativePath: file.webkitRelativePath || file.name,
      url: URL.createObjectURL(file),
    }))
    setPreviewUrls(urls)

    return () => {
      urls.forEach((it) => URL.revokeObjectURL(it.url))
    }
  }, [imageFiles])

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragStateRef.current.active) return
      const nextX = Math.max(12, e.clientX - dragStateRef.current.offsetX)
      const nextY = Math.max(12, e.clientY - dragStateRef.current.offsetY)
      setFloatingPos({ x: nextX, y: nextY })
    }

    const onMouseUp = () => {
      dragStateRef.current.active = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const cached = window.localStorage.getItem(WORKBENCH_RUNTIME_KEY)
      if (!cached) return
      const parsed = JSON.parse(cached)
      if (!parsed || typeof parsed !== 'object') return

      setMode(parsed.mode || 'MyAgent_API')
      setStatus(parsed.status || 'idle')
      setStatusMessage(parsed.statusMessage || '')
      setBatchId(parsed.batchId || '')
      setBatchSourceType(parsed.batchSourceType || 'single')
      setActiveTaskId(parsed.activeTaskId || '')

      const nextJobs = Array.isArray(parsed.jobs) ? parsed.jobs : []
      setJobs(nextJobs)
      jobsRef.current = nextJobs
      if (nextJobs.length) {
        syncJobsFromServer(nextJobs)
      }

      const hasRunning = hasNonTerminalJobs(nextJobs)
      if (hasRunning) {
        inFlightRef.current = true
        beginPolling(nextJobs)
      } else {
        // 防止恢复到陈旧的 inferencing/uploading 状态导致上传入口被错误锁定。
        inFlightRef.current = false
        stopPolling()
        if (nextJobs.length) {
          setStatus('done')
          setStatusMessage(summarizeFinalStatus(nextJobs))
        } else {
          setStatus('idle')
          setStatusMessage('')
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [])

  useEffect(() => {
    const payload = {
      mode,
      status,
      statusMessage,
      batchId,
      batchSourceType,
      activeTaskId,
      jobs,
    }
    window.localStorage.setItem(WORKBENCH_RUNTIME_KEY, JSON.stringify(payload))
  }, [mode, status, statusMessage, batchId, batchSourceType, activeTaskId, jobs])

  const isBatch = jobs.length > 1 || imageFiles.length > 1
  const isFolderBatch =
    batchSourceType === 'folder' || imageFiles.some((f) => (f.webkitRelativePath || '').includes('/'))

  const previewUrlMap = useMemo(() => {
    const map = new Map()
    previewUrls.forEach((it) => {
      map.set(it.fileName, it.url)
      map.set(it.relativePath, it.url)
    })
    return map
  }, [previewUrls])

  const activeJob = useMemo(() => {
    if (!jobs.length) return null
    if (activeTaskId) {
      const hit = jobs.find((j) => j.taskId === activeTaskId)
      if (hit) return hit
    }
    return jobs[0]
  }, [activeTaskId, jobs])

  const floatingCompareJob = useMemo(
    () => jobs.find((job) => job.taskId === floatingCompareTaskId) || null,
    [floatingCompareTaskId, jobs]
  )

  const hasRunningJobs = useMemo(
    () => jobs.some((job) => !isTerminalStatus(job.status)),
    [jobs]
  )
  const hasActiveRun =
    inFlightRef.current || status === 'uploading' || status === 'inferencing' || hasRunningJobs
  const canStart = useMemo(() => imageFiles.length > 0 && !hasActiveRun, [imageFiles.length, hasActiveRun])
  const canCancelCurrent = useMemo(() => {
    if (!activeJob) return false
    return hasActiveRun && !isTerminalStatus(activeJob.status)
  }, [activeJob, hasActiveRun])
  const canCancelAll = useMemo(
    () => hasActiveRun && jobs.some((job) => !isTerminalStatus(job.status)),
    [hasActiveRun, jobs]
  )

  const folderGroups = useMemo(() => {
    if (!isFolderBatch) return []
    const map = new Map()
    jobs.forEach((job) => {
      const rel = (job.relativePath || job.fileName || '').replace(/\\/g, '/')
      const groupName = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') || rel.split('/')[0] : '根目录'
      const arr = map.get(groupName) || []
      arr.push(job)
      map.set(groupName, arr)
    })
    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }))
  }, [isFolderBatch, jobs])

  useEffect(() => {
    if (!folderGroups.length) return
    setExpandedGroups((prev) => {
      const next = { ...prev }
      folderGroups.forEach((group) => {
        if (!(group.groupName in next)) next[group.groupName] = true
      })
      return next
    })
  }, [folderGroups])

  useEffect(() => {
    const handleFocus = () => {
      const currentJobs = jobsRef.current
      if (!currentJobs.length) return
      syncJobsFromServer(currentJobs)
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  function normalizeJob(taskData, fallbackName = '') {
    const taskId = String(taskData?.taskId || taskData?.id || '')
    const prevJob = jobsRef.current.find((job) => job.taskId === taskId)
    return {
      taskId,
      fileName: taskData?.fileName || fallbackName,
      status: taskData?.status || 'queued',
      inputImageUrl: taskData?.inputImageUrl || '',
      resultImageUrl: taskData?.resultImageUrl || '',
      errorMessage: taskData?.errorMessage || '',
      logText: taskData?.logText || '',
      flow: mergeFlowProgress(prevJob?.flow || null, taskData?.flow || null),
      relativePath: taskData?.relativePath || '',
      sourceType: taskData?.sourceType || 'single',
      uploadGroup: taskData?.uploadGroup || '',
    }
  }

  function resetTaskStates() {
    setBatchId('')
    setBatchSourceType('single')
    setJobs([])
    jobsRef.current = []
    setActiveTaskId('')
    setFloatingCompareTaskId('')
    setExpandedGroups({})
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  function beginPolling(initialJobs) {
    setJobs(initialJobs)
    jobsRef.current = initialJobs
    if (!activeTaskId && initialJobs.length) {
      setActiveTaskId(initialJobs[0].taskId)
    }

    stopPolling()
    pollingRef.current = window.setInterval(async () => {
      if (pollingBusyRef.current) return
      pollingBusyRef.current = true
      try {
        const currentJobs = jobsRef.current
        if (!currentJobs.length) return
        const nextJobs = await Promise.all(
          currentJobs.map(async (job) => {
            if (isTerminalStatus(job.status)) return job
            try {
              const task = await fetchTaskStatus(job.taskId)
              return normalizeJob(task, job.fileName)
            } catch (pollError) {
              return {
                ...job,
                status: 'failed',
                errorMessage: pollError?.message || '查询任务状态失败',
              }
            }
          })
        )

        jobsRef.current = nextJobs
        setJobs(nextJobs)

        if (activeTaskId && !nextJobs.some((it) => it.taskId === activeTaskId)) {
          setActiveTaskId(nextJobs[0]?.taskId || '')
        }

        const runningCount = nextJobs.filter((it) => !isTerminalStatus(it.status)).length
        if (runningCount === 0) {
          finalizeJobsIfComplete(nextJobs)
        } else {
          setStatus('inferencing')
          setStatusMessage(summarizeRunningStatus(nextJobs))
        }
      } finally {
        pollingBusyRef.current = false
      }
    }, 2000)
  }

  function finalizeJobsIfComplete(nextJobs) {
    if (nextJobs.some((it) => !isTerminalStatus(it.status))) return
    stopPolling()
    inFlightRef.current = false
    setStatus('done')
    setStatusMessage(summarizeFinalStatus(nextJobs))
  }

  function startPollingIfNeeded(nextJobs) {
    if (!nextJobs.length) {
      inFlightRef.current = false
      stopPolling()
      setStatus('idle')
      setStatusMessage('')
      return
    }
    const hasRunning = nextJobs.some((it) => !isTerminalStatus(it.status))
    if (hasRunning && !pollingRef.current) {
      inFlightRef.current = true
      setStatus('inferencing')
      setStatusMessage(summarizeRunningStatus(nextJobs))
      beginPolling(nextJobs)
      return
    }
    if (!hasRunning) {
      finalizeJobsIfComplete(nextJobs)
    }
  }

  async function syncJobsFromServer(jobList) {
    if (!Array.isArray(jobList) || !jobList.length) {
      inFlightRef.current = false
      stopPolling()
      setJobs([])
      jobsRef.current = []
      setStatus('idle')
      setStatusMessage('')
      return
    }
    try {
      const nextJobs = await Promise.all(
        jobList.map(async (job) => {
          try {
            const task = await fetchTaskStatus(job.taskId)
            return normalizeJob(task, job.fileName)
          } catch {
            return job
          }
        })
      )
      setJobs(nextJobs)
      jobsRef.current = nextJobs
      finalizeJobsIfComplete(nextJobs)
      startPollingIfNeeded(nextJobs)
    } catch {
      // ignore sync errors
    }
  }

  async function refreshJobStatus(taskId) {
    if (!taskId) return
    try {
      const task = await fetchTaskStatus(taskId)
      setJobs((prev) => {
        const next = prev.map((job) =>
          job.taskId === taskId ? normalizeJob(task, job.fileName) : job
        )
        jobsRef.current = next
        finalizeJobsIfComplete(next)
        return next
      })
    } catch {
      // ignore refresh errors
    }
  }

  function stageStyle(stepId) {
    if (status === 'uploading') {
      return stepId === 'upload' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'
    }
    if (status === 'inferencing') {
      if (stepId === 'upload') return 'border-emerald-200 bg-emerald-50'
      if (stepId === 'infer') return 'border-amber-200 bg-amber-50'
      return 'border-slate-200 bg-slate-50'
    }
    if (status === 'done') {
      return 'border-emerald-200 bg-emerald-50'
    }
    return 'border-slate-200 bg-slate-50'
  }

  async function handleStart() {
    setErrorMessage('')
    setFileError('')

    if (!imageFiles.length) {
      setFileError('请先上传图片，再开始处理。')
      return
    }

    if (inFlightRef.current) return

    inFlightRef.current = true
    resetTaskStates()

    setStatus('uploading')
    setStatusMessage('正在上传输入图像…')

    inferTimerRef.current = window.setTimeout(() => {
      setStatus('inferencing')
      setStatusMessage('任务已提交，等待后端执行…')
    }, 600)

    try {
      if (imageFiles.length === 1) {
        const data = await submitRestoreTask({ imageFile: imageFiles[0], mode })
        const nextTaskId = data?.taskId || data?.id
        if (!nextTaskId) {
          throw new Error('接口返回缺少 taskId，请检查后端响应字段。')
        }

        const initialJobs = [
          normalizeJob(
            {
              taskId: String(nextTaskId),
              fileName: data?.fileName || imageFiles[0].name,
              status: data?.status || 'queued',
              sourceType: 'single',
            },
            imageFiles[0].name
          ),
        ]
        setBatchSourceType('single')
        setStatus('inferencing')
        setStatusMessage('云端 GPU 推理中，请稍候…')
        beginPolling(initialJobs)
      } else {
        const data = await submitRestoreBatchTask({ imageFiles, mode })
        const submitted = Array.isArray(data?.tasks) ? data.tasks : []
        if (!submitted.length) {
          throw new Error('批量接口返回为空，请检查后端响应字段。')
        }

        const sourceType = data?.sourceType || (imageFiles.some((f) => (f.webkitRelativePath || '').includes('/')) ? 'folder' : 'batch')
        setBatchSourceType(sourceType)
        setBatchId(String(data?.batchId || ''))
        const initialJobs = submitted.map((it, index) =>
          normalizeJob(
            {
              ...it,
              sourceType,
            },
            imageFiles[index]?.name || ''
          )
        )

        setStatus('inferencing')
        setStatusMessage(`批量推理中：共 ${initialJobs.length} 张图片`)
        beginPolling(initialJobs)
      }
    } catch (e) {
      setStatus('idle')
      setStatusMessage('')
      setErrorMessage(e?.message || '处理失败')
      inFlightRef.current = false
    } finally {
      if (inferTimerRef.current) {
        clearTimeout(inferTimerRef.current)
        inferTimerRef.current = null
      }
    }
  }

  async function handleCancelTask(taskId) {
    if (!taskId) return
    try {
      if (inferTimerRef.current) {
        clearTimeout(inferTimerRef.current)
        inferTimerRef.current = null
      }
      await cancelTask(taskId)
      setStatus('inferencing')
      setStatusMessage('正在取消任务...')
      await refreshJobStatus(taskId)
      window.setTimeout(() => refreshJobStatus(taskId), 1500)
    } catch (e) {
      setErrorMessage(e?.message || '取消任务失败')
    }
  }

  async function handleCancelAll() {
    const pending = jobs.filter((job) => !isTerminalStatus(job.status))
    if (!pending.length) return
    if (inferTimerRef.current) {
      clearTimeout(inferTimerRef.current)
      inferTimerRef.current = null
    }
    setStatus('inferencing')
    setStatusMessage(`正在取消 ${pending.length} 个任务...`)
    await Promise.allSettled(pending.map((job) => cancelTask(job.taskId)))
  }

  useEffect(() => {
    return () => {
      stopPolling()
      if (inferTimerRef.current) {
        clearTimeout(inferTimerRef.current)
        inferTimerRef.current = null
      }
    }
  }, [])

  async function handleDownloadOriginal() {
    if (!activeJob) return
    const key = activeJob.relativePath || activeJob.fileName
    const fallbackPreview = previewUrlMap.get(key) || previewUrlMap.get(activeJob.fileName) || ''
    const beforeUrl = resolveApiAssetUrl(activeJob.inputImageUrl || fallbackPreview)
    if (!beforeUrl) return

    setIsDownloading(true)
    try {
      await downloadByUrl(beforeUrl, activeJob.fileName || 'original')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadResult() {
    if (!activeJob?.resultImageUrl) return
    const resultUrl = resolveApiAssetUrl(activeJob.resultImageUrl)

    setIsDownloading(true)
    try {
      await downloadByUrl(resultUrl, 'result')
    } finally {
      setIsDownloading(false)
    }
  }

  function toggleGroup(groupName) {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }

  function startFloatingDrag(e) {
    dragStateRef.current.active = true
    dragStateRef.current.offsetX = e.clientX - floatingPos.x
    dragStateRef.current.offsetY = e.clientY - floatingPos.y
  }

  function renderJobCard(job) {
    const key = job.relativePath || job.fileName
    const localPreview = previewUrlMap.get(key) || previewUrlMap.get(job.fileName) || ''
    const beforeUrl = resolveApiAssetUrl(job.inputImageUrl || localPreview)
    const afterUrl = resolveApiAssetUrl(job.resultImageUrl || '')

    const canShowBatchCompare = Boolean(beforeUrl && afterUrl)

    return (
      <button
        key={job.taskId}
        type="button"
        onClick={() => setActiveTaskId(job.taskId)}
        className={[
          'rounded-xl border p-3 text-left transition hover:border-slate-400',
          activeJob?.taskId === job.taskId
            ? 'border-indigo-300 bg-indigo-50/40'
            : 'border-slate-200 bg-white',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-2 text-xs font-semibold text-slate-800">
            {job.fileName || job.taskId}
          </p>
          <span
            className={[
              'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
              jobStatusStyle(job.status),
            ].join(' ')}
          >
            {job.status}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-200 bg-slate-100 p-1">
            {beforeUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!canShowBatchCompare) return
                  setActiveTaskId(job.taskId)
                  setFloatingCompareTaskId(job.taskId)
                }}
                className="block w-full"
                disabled={!canShowBatchCompare}
              >
                <img src={beforeUrl} alt="处理前" className="h-20 w-full rounded object-cover" />
              </button>
            ) : (
              <div className="flex h-20 items-center justify-center text-[11px] text-slate-500">
                无预览
              </div>
            )}
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-100 p-1">
            {afterUrl ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!canShowBatchCompare) return
                  setActiveTaskId(job.taskId)
                  setFloatingCompareTaskId(job.taskId)
                }}
                className="block w-full"
                disabled={!canShowBatchCompare}
              >
                <img src={afterUrl} alt="处理后" className="h-20 w-full rounded object-cover" />
              </button>
            ) : (
              <div className="flex h-20 items-center justify-center text-[11px] text-slate-500">
                处理中
              </div>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-6 motion-safe:animate-fadeIn">
      <PageHeader
        title="核心工作台"
        description="该页面用于上传输入图像、配置复原模式，并查看实验结果对比。"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-4">
          <Card className="space-y-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
              <Settings2 size={16} aria-hidden="true" />
              参数配置
            </h3>

            <FileDropzone
              values={imageFiles}
              multiple
              directory
              disabled={hasActiveRun}
              error={fileError}
              onChange={(files, err) => {
                if (hasActiveRun) {
                  setFileError('任务执行中，暂不支持重新上传。请先结束当前任务。')
                  return
                }
                const next = Array.isArray(files) ? files : files ? [files] : []
                setImageFiles(next)
                setFileError(err || '')
                setErrorMessage('')

                resetTaskStates()
                setStatus('idle')
                setStatusMessage('')
                inFlightRef.current = false
                stopPolling()
              }}
            />
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">复原模式</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full rounded-lg border-slate-300 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
              >
                {RESTORE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">当前选择：{modeLabel(mode)}</p>
            </div>

            <div className="flex">
              {hasActiveRun ? (
                <Button
                  variant="danger"
                  onClick={() => handleCancelTask(activeJob?.taskId)}
                  disabled={!canCancelCurrent}
                  className="w-full gap-2"
                >
                  <StopCircle size={15} aria-hidden="true" />
                  结束当前
                </Button>
              ) : (
                <Button variant="primary" onClick={handleStart} disabled={!canStart} className="w-full gap-2">
                  <WandSparkles size={15} aria-hidden="true" />
                  开始处理
                </Button>
              )}
            </div>

            {isBatch && hasActiveRun ? (
              <Button variant="danger" onClick={handleCancelAll} disabled={!canCancelAll} className="w-full gap-2">
                <StopCircle size={15} aria-hidden="true" />
                结束本批次全部任务
              </Button>
            ) : null}

            <div className="space-y-3">
              <StatusBanner status={status} message={statusMessage} />
              <Alert title="处理失败" message={errorMessage} />

              {batchId ? (
                <p className="text-xs text-slate-500">
                  批次 ID：<span className="font-mono">{batchId}</span>
                </p>
              ) : null}

              {!batchId && activeJob?.taskId ? (
                <p className="text-xs text-slate-500">
                  任务 ID：<span className="font-mono">{activeJob.taskId}</span>
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">说明</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>任务 ID 和上传文件会按时间戳命名，便于追溯与归档。</li>
              <li>文件夹上传会保留后端目录层级，历史页按批次可折叠查看。</li>
              <li>页面切换后会自动恢复任务状态，不会丢失当前展示进度。</li>
            </ul>
          </Card>
        </section>

        <section className="space-y-4 lg:col-span-8">
          <Card className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                实验结果{isBatch ? '（批量）' : ''}
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleDownloadOriginal}
                  disabled={!activeJob || isDownloading}
                  className="gap-2"
                >
                  <Download size={15} aria-hidden="true" />
                  下载原图
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDownloadResult}
                  disabled={!activeJob?.resultImageUrl || isDownloading}
                  className="gap-2"
                >
                  <Download size={15} aria-hidden="true" />
                  下载结果
                </Button>
              </div>
            </div>

            {!isBatch ? (
              <>
                <BeforeAfterSlider
                  beforeSrc={resolveApiAssetUrl(activeJob?.inputImageUrl || previewUrls[0]?.url || '')}
                  afterSrc={resolveApiAssetUrl(activeJob?.resultImageUrl || '')}
                  disabled={status === 'uploading' || status === 'inferencing'}
                />
              </>
            ) : isFolderBatch ? (
              <div className="space-y-3">
                {folderGroups.map((group) => {
                  const open = expandedGroups[group.groupName] ?? true
                  return (
                    <div key={group.groupName} className="rounded-xl border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.groupName)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left"
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                          {open ? <FolderOpen size={16} /> : <Folder size={16} />}
                          {group.groupName}
                        </span>
                        <span className="text-xs text-slate-500">{group.items.length} 张</span>
                      </button>
                      {open ? (
                        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2 xl:grid-cols-3">
                          {group.items.map((job) => renderJobCard(job))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => renderJobCard(job))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">状态说明</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className={['rounded-xl border p-3 transition-colors', stageStyle('upload')].join(' ')}>
                <p className="text-xs font-semibold text-slate-900">上传</p>
                <p className="mt-1 text-xs text-slate-600">客户端到后端</p>
              </div>
              <div className={['rounded-xl border p-3 transition-colors', stageStyle('infer')].join(' ')}>
                <p className="text-xs font-semibold text-slate-900">推理</p>
                <p className="mt-1 text-xs text-slate-600">云端 GPU 推理（可手动结束）</p>
              </div>
              <div className={['rounded-xl border p-3 transition-colors', stageStyle('result')].join(' ')}>
                <p className="text-xs font-semibold text-slate-900">结果</p>
                <p className="mt-1 text-xs text-slate-600">支持批次展开与悬浮拖拽对比</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">智能体推理过程（日志）</h3>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 p-3">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-emerald-200">
                {activeJob?.logText || '日志将在任务开始后显示（含命令输出与 workflow.log 片段）'}
              </pre>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">实时流程可视化</h3>
            <div className="mt-3 space-y-4">
              {activeJob?.flow?.stages?.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {activeJob.flow.stages.map((stage) => (
                    <div
                      key={stage.id}
                      className={[
                        'rounded-xl border p-3',
                        stage.done
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : 'border-slate-200 bg-slate-50',
                      ].join(' ')}
                    >
                      <p className="text-xs font-semibold text-slate-900">{stage.label}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {stage.done ? '已完成' : '进行中'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">任务开始后将自动展示流程节点。</p>
              )}

              {activeJob?.flow?.iqaLines?.length ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">评估（IQA）</p>
                  {activeJob.flow.iqaLines
                    .map((line) => stripAnsi(line))
                    .filter((line) => line)
                    .length ? (
                    <ul className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-emerald-900 sm:grid-cols-2">
                      {activeJob.flow.iqaLines
                        .map((line) => stripAnsi(line))
                        .filter((line) => line)
                        .map((line, idx) => (
                          <li key={`${idx}-${line.slice(0, 8)}`} className="rounded-md bg-white px-2 py-1">
                            {line}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {activeJob?.flow?.degradations?.length || activeJob?.flow?.imageDescription ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">感知</p>
                  <div className="mt-2 space-y-1 text-[11px] text-emerald-900">
                    {activeJob?.flow?.degradations?.length ? (
                      <p>
                        <span className="font-semibold text-emerald-900">退化类型:</span>{' '}
                        {activeJob.flow.degradations.join('、')}
                      </p>
                    ) : null}
                    {activeJob?.flow?.imageDescription ? (
                      <p>
                        <span className="font-semibold text-emerald-900">描述:</span>{' '}
                        {stripAnsi(activeJob.flow.imageDescription)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeJob?.flow?.attempts?.length ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-900">按工作流分轮次（Attempt）</p>
                  {activeJob.flow.attempts.map((attempt) => (
                    <div key={attempt.id || attempt.index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">
                          Attempt {attempt.index}
                          {attempt.planSource === 'adjusted' ? '（重规划）' : '（初始规划）'}
                        </p>
                        <span
                          className={[
                            'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            attemptStatusStyle(attempt.status),
                          ].join(' ')}
                        >
                          {attemptStatusLabel(attempt.status)}
                        </span>
                      </div>

                      {attempt.startedAt ? (
                        <p className="mt-1 text-[11px] text-slate-600">开始时间：{prettyTimestamp(attempt.startedAt)}</p>
                      ) : null}

                      {attempt.rollbackNote ? (
                        <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          {stripAnsi(attempt.rollbackNote)}
                        </p>
                      ) : null}

                      {attempt.planList?.length ? (
                        <div className="mt-2">
                          <p className="text-[11px] font-semibold text-slate-800">决策计划</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-700">
                            {attempt.planList.map((item, idx) => (
                              <li key={`${attempt.index}-plan-${idx}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {attempt.executionSteps?.length ? (
                        <div className="mt-3 space-y-2">
                          {attempt.executionSteps.map((step) => (
                            <div key={`${attempt.index}-${step.index}-${step.subtask}`} className="rounded-md border border-slate-200 bg-white p-2">
                              <p className="text-[11px] font-semibold text-slate-900">
                                Step {step.index}: {step.subtask}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-600">
                                输入节点：{stripAnsi(step.executionTarget || 'input')}
                              </p>
                              {step.startedAt ? (
                                <p className="mt-1 text-[11px] text-slate-500">开始：{prettyTimestamp(step.startedAt)}</p>
                              ) : null}
                              {step.toolTrials?.length ? (
                                <div className="mt-2">
                                  <p className="text-[11px] font-semibold text-slate-700">工具试跑</p>
                                  <ul className="mt-1 space-y-2 text-[11px] text-slate-700">
                                    {step.toolTrials.map((trial, idx) => (
                                      <li key={`${attempt.index}-${step.index}-trial-${idx}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                        <p>
                                          {trial.tool}（{trial.degradation}）
                                        </p>
                                        {trial.thumbnailUrl ? (
                                          <img
                                            src={resolveApiAssetUrl(trial.thumbnailUrl)}
                                            alt={`${trial.subtask}-${trial.tool}`}
                                            className="mt-1 h-16 w-full rounded object-cover"
                                          />
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {step.faceScores?.length ? (
                                <div className="mt-2">
                                  <p className="text-[11px] font-semibold text-slate-700">人脸评分</p>
                                  <ul className="mt-1 space-y-1 text-[11px] text-slate-700">
                                    {step.faceScores.map((face, idx) => (
                                      <li key={`${attempt.index}-${step.index}-face-${idx}`} className="rounded bg-slate-50 px-2 py-1">
                                        Face {face.faceId} / {face.tool}: {face.score ?? '-'}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {step.bestTool ? (
                                <p className="mt-2 text-[11px] text-emerald-700">
                                  最优工具：<span className="font-semibold">{step.bestTool}</span>
                                </p>
                              ) : null}
                              {typeof step.qualityScore === 'number' ? (
                                <p className="mt-1 text-[11px] text-emerald-700">
                                  质量分：<span className="font-semibold">{step.qualityScore}</span>
                                </p>
                              ) : null}
                              {step.resultLine ? (
                                <p className="mt-1 text-[11px] text-slate-600">{stripAnsi(step.resultLine)}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-500">本轮尚未开始执行。</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : activeJob?.flow?.planList?.length ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">决策</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-emerald-900">
                    {activeJob.flow.planList.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {activeJob?.flow?.bestTool || activeJob?.flow?.finalResult ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">反馈</p>
                  <div className="mt-2 space-y-1 text-[11px] text-emerald-900">
                    {activeJob?.flow?.bestTool ? (
                      <p>
                        <span className="font-semibold text-emerald-900">最优工具:</span>{' '}
                        {activeJob.flow.bestTool}
                      </p>
                    ) : null}
                    {activeJob?.flow?.finalResult ? (
                      <p>
                        <span className="font-semibold text-emerald-900">结果:</span>{' '}
                        {stripAnsi(activeJob.flow.finalResult)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeJob?.flow?.toolNodes?.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-900">工具执行结果缩略图</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {activeJob.flow.toolNodes.map((node, index) => (
                      <div
                        key={`${node.subtask}-${node.tool}-${index}`}
                        className={[
                          'rounded-lg border p-2',
                          node.isBest
                            ? 'border-amber-300 bg-amber-50/60'
                            : 'border-slate-200 bg-white',
                        ].join(' ')}
                      >
                        <p className="text-[11px] font-semibold text-slate-900">
                          {node.subtask} / {node.tool}
                        </p>
                        {node.thumbnailUrl ? (
                          <img
                            src={resolveApiAssetUrl(node.thumbnailUrl)}
                            alt={`${node.subtask}-${node.tool}`}
                            className="mt-2 h-24 w-full rounded object-cover"
                          />
                        ) : (
                          <div className="mt-2 flex h-24 items-center justify-center rounded bg-slate-100 text-[11px] text-slate-500">
                            缩略图未生成
                          </div>
                        )}
                        {node.isBest ? (
                          <p className="mt-1 text-[11px] font-semibold text-amber-700">已选为最优</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeJob?.flow?.scoreLines?.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-900">打分与选择（最终汇总）</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    该区域展示运行目录中的最终评分文件，分轮细节请看上方 Attempt 卡片中的“工具试跑/质量分”。
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] leading-5 text-slate-700">
                    {activeJob.flow.scoreLines.map((line, idx) => (
                      <li key={`${idx}-${line.slice(0, 12)}`} className="break-all">
                        {normalizeFlowText(line)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      </div>

      {floatingCompareJob ? (
        <div
          className="fixed z-50 w-[min(92vw,720px)] rounded-xl border border-slate-300 bg-white p-3 shadow-2xl"
          style={{ left: `${floatingPos.x}px`, top: `${floatingPos.y}px` }}
        >
          <div
            className="mb-2 flex cursor-move items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
            onMouseDown={startFloatingDrag}
          >
            <p className="line-clamp-1 text-xs font-semibold text-slate-700">
              悬浮对比：{floatingCompareJob.fileName || floatingCompareJob.taskId}
            </p>
            <button
              type="button"
              onClick={() => setFloatingCompareTaskId('')}
              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            >
              <X size={14} />
            </button>
          </div>
          <BeforeAfterSlider
            beforeSrc={resolveApiAssetUrl(floatingCompareJob.inputImageUrl || '')}
            afterSrc={resolveApiAssetUrl(floatingCompareJob.resultImageUrl || '')}
            disabled={!floatingCompareJob.inputImageUrl || !floatingCompareJob.resultImageUrl}
          />
        </div>
      ) : null}
    </div>
  )
}
