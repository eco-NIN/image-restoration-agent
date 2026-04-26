import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Settings2, WandSparkles } from 'lucide-react'

import Alert from '../components/Alert.jsx'
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx'
import { Button } from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import FileDropzone from '../components/FileDropzone.jsx'
import PageHeader from '../components/PageHeader.jsx'
import StatusBanner from '../components/StatusBanner.jsx'
import {
  fetchTaskStatus,
  resolveApiAssetUrl,
  submitRestoreBatchTask,
  submitRestoreTask,
} from '../services/apiClient.js'
import { downloadByUrl } from '../utils/download.js'

const RESTORE_MODES = [
  { value: 'FastGen4K_P', label: 'FastGen4K_P（默认）' },
  { value: 'FaceEnhance', label: '人脸增强' },
  { value: 'Dehaze', label: '去雾' },
  { value: 'OldPhoto', label: '老照片修复' },
]

function modeLabel(modeValue) {
  return RESTORE_MODES.find((m) => m.value === modeValue)?.label ?? modeValue
}

function jobStatusStyle(status) {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (status === 'failed') return 'bg-rose-100 text-rose-800 border-rose-200'
  if (status === 'running') return 'bg-indigo-100 text-indigo-800 border-indigo-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export default function WorkbenchPage() {
  const [imageFiles, setImageFiles] = useState([])
  const [mode, setMode] = useState('FastGen4K_P')

  const [errorMessage, setErrorMessage] = useState('')
  const [fileError, setFileError] = useState('')

  const [status, setStatus] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [batchId, setBatchId] = useState('')
  const [jobs, setJobs] = useState([])
  const [activeTaskId, setActiveTaskId] = useState('')

  const [isDownloading, setIsDownloading] = useState(false)
  const [previewUrls, setPreviewUrls] = useState([])

  const inFlightRef = useRef(false)
  const inferTimerRef = useRef(null)
  const pollingRef = useRef(null)
  const pollingBusyRef = useRef(false)

  useEffect(() => {
    if (!imageFiles.length) {
      setPreviewUrls([])
      return
    }

    const urls = imageFiles.map((file) => ({
      fileName: file.name,
      url: URL.createObjectURL(file),
    }))
    setPreviewUrls(urls)

    return () => {
      urls.forEach((it) => URL.revokeObjectURL(it.url))
    }
  }, [imageFiles])

  const isBatch = imageFiles.length > 1

  const previewUrlMap = useMemo(() => {
    const map = new Map()
    previewUrls.forEach((it) => map.set(it.fileName, it.url))
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

  const canStart = useMemo(() => {
    return imageFiles.length > 0 && !inFlightRef.current
  }, [imageFiles.length])

  function normalizeJob(taskData, fallbackName = '') {
    return {
      taskId: String(taskData?.taskId || taskData?.id || ''),
      fileName: taskData?.fileName || fallbackName,
      status: taskData?.status || 'queued',
      inputImageUrl: taskData?.inputImageUrl || '',
      resultImageUrl: taskData?.resultImageUrl || '',
      errorMessage: taskData?.errorMessage || '',
      logText: taskData?.logText || '',
      flow: taskData?.flow || null,
    }
  }

  function resetTaskStates() {
    setBatchId('')
    setJobs([])
    setActiveTaskId('')
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  function beginPolling(initialJobs) {
    setJobs(initialJobs)
    if (!activeTaskId && initialJobs.length) {
      setActiveTaskId(initialJobs[0].taskId)
    }

    stopPolling()
    pollingRef.current = window.setInterval(async () => {
      if (pollingBusyRef.current) return
      pollingBusyRef.current = true
      try {
        const currentJobs = jobs.length ? jobs : initialJobs
        const nextJobs = await Promise.all(
          currentJobs.map(async (job) => {
            if (job.status === 'done' || job.status === 'failed') return job
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

        setJobs(nextJobs)

        const runningCount = nextJobs.filter(
          (it) => it.status !== 'done' && it.status !== 'failed'
        ).length
        if (runningCount === 0) {
          stopPolling()
          inFlightRef.current = false
          const doneCount = nextJobs.filter((it) => it.status === 'done').length
          const failCount = nextJobs.filter((it) => it.status === 'failed').length
          setStatus('done')
          setStatusMessage(`处理完成：成功 ${doneCount}，失败 ${failCount}`)
        }
      } finally {
        pollingBusyRef.current = false
      }
    }, 2000)
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
              fileName: imageFiles[0].name,
              status: data?.status || 'queued',
            },
            imageFiles[0].name
          ),
        ]
        setStatus('inferencing')
        setStatusMessage('云端 GPU 推理中，请稍候…')
        beginPolling(initialJobs)
      } else {
        const data = await submitRestoreBatchTask({ imageFiles, mode })
        const submitted = Array.isArray(data?.tasks) ? data.tasks : []
        if (!submitted.length) {
          throw new Error('批量接口返回为空，请检查后端响应字段。')
        }

        setBatchId(String(data?.batchId || ''))
        const initialJobs = submitted.map((it, index) =>
          normalizeJob(it, imageFiles[index]?.name || '')
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
    const fallbackPreview = previewUrlMap.get(activeJob.fileName) || ''
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

  return (
    <div className="space-y-6 motion-safe:animate-fadeIn">
      <PageHeader
        title="核心工作台"
        description="该页面用于上传输入图像、配置复原模式，并查看实验结果对比。"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-4 space-y-4">
          <Card className="space-y-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
              <Settings2 size={16} aria-hidden="true" />
              参数配置
            </h3>

            <FileDropzone
              values={imageFiles}
              multiple
              directory
              error={fileError}
              onChange={(files, err) => {
                const next = Array.isArray(files) ? files : files ? [files] : []
                setImageFiles(next)
                setFileError(err || '')
                setErrorMessage('')

                resetTaskStates()
                setStatus('idle')
                setStatusMessage('')
              }}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-900">
                复原模式
              </label>
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
              <p className="text-xs text-slate-500">
                当前选择：{modeLabel(mode)}
              </p>
            </div>

            <Button
              variant="primary"
              onClick={handleStart}
              disabled={!canStart}
              className="w-full gap-2"
            >
              <WandSparkles size={15} aria-hidden="true" />
              开始处理
            </Button>

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
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              说明
            </h3>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>支持单图上传，也支持文件夹批量上传（自动筛选图片）。</li>
              <li>推理时长与图片大小、模型、GPU 资源有关。</li>
              <li>批量模式下可点击右侧任务卡片查看单图详细日志与流程。</li>
            </ul>
          </Card>
        </section>

        <section className="lg:col-span-8 space-y-4">
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
              <BeforeAfterSlider
                beforeSrc={resolveApiAssetUrl(
                  activeJob?.inputImageUrl || previewUrls[0]?.url || ''
                )}
                afterSrc={resolveApiAssetUrl(activeJob?.resultImageUrl || '')}
                disabled={status === 'uploading' || status === 'inferencing'}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => {
                  const localPreview = previewUrlMap.get(job.fileName) || ''
                  const beforeUrl = resolveApiAssetUrl(job.inputImageUrl || localPreview)
                  const afterUrl = resolveApiAssetUrl(job.resultImageUrl || '')

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
                        <p className="line-clamp-1 text-xs font-semibold text-slate-800">
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
                            <img
                              src={beforeUrl}
                              alt="处理前"
                              className="h-20 w-full rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-20 items-center justify-center text-[11px] text-slate-500">
                              无预览
                            </div>
                          )}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-100 p-1">
                          {afterUrl ? (
                            <img
                              src={afterUrl}
                              alt="处理后"
                              className="h-20 w-full rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-20 items-center justify-center text-[11px] text-slate-500">
                              处理中
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              状态说明
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-900">上传</p>
                <p className="mt-1 text-xs text-slate-600">客户端到后端</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-900">推理</p>
                <p className="mt-1 text-xs text-slate-600">云端 GPU 推理</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-900">结果</p>
                <p className="mt-1 text-xs text-slate-600">生成对比与下载</p>
              </div>
            </div>
            {isBatch ? (
              <p className="mt-3 text-xs text-slate-500">
                批量模式：点击上方任意任务卡片，可在下方查看该图片的日志与流程细节。
              </p>
            ) : null}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              智能体推理过程（日志）
            </h3>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 p-3">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-emerald-200">
                {activeJob?.logText ||
                  '日志将在任务开始后显示（含命令输出与 workflow.log 片段）'}
              </pre>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              实时流程可视化
            </h3>
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
                      <p className="mt-1 line-clamp-3 text-[11px] text-slate-600">
                        {stage.detail || '等待中'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">任务开始后将自动展示流程节点。</p>
              )}

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
                  <p className="text-xs font-semibold text-slate-900">打分与选择</p>
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">
                    {activeJob.flow.scoreLines.join('\n')}
                  </pre>
                </div>
              ) : null}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
