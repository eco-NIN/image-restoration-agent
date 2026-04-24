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

export default function WorkbenchPage() {
  // 关键状态：用户上传的原始文件
  const [imageFile, setImageFile] = useState(null)
  // 关键状态：下拉菜单选择的复原模式
  const [mode, setMode] = useState('FastGen4K_P')

  // 关键状态：页面内的错误信息（包含校验错误与接口错误）
  const [errorMessage, setErrorMessage] = useState('')
  const [fileError, setFileError] = useState('')

  // 关键状态：任务处理进度与结果
  const [status, setStatus] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [taskId, setTaskId] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [logText, setLogText] = useState('')

  const [isDownloading, setIsDownloading] = useState(false)

  // 原图预览：使用 ObjectURL，注意在 file 变更/卸载时释放
  const [previewUrl, setPreviewUrl] = useState('')

  const inFlightRef = useRef(false)
  const inferTimerRef = useRef(null)
  const pollingRef = useRef(null)

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('')
      return
    }

    const url = URL.createObjectURL(imageFile)
    setPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [imageFile])

  const canStart = useMemo(() => {
    return Boolean(imageFile) && !inFlightRef.current
  }, [imageFile])

  async function handleStart() {
    setErrorMessage('')
    setFileError('')

    // 防御性：未上传图片时禁止开始
    if (!imageFile) {
      setFileError('请先上传一张输入图像，再开始处理。')
      return
    }

    if (inFlightRef.current) return

    inFlightRef.current = true
    setTaskId('')
    setResultUrl('')
    setLogText('')

    // 阶段 1：上传阶段
    setStatus('uploading')
    setStatusMessage('正在上传输入图像…')

    // 阶段 2：推理阶段（由轮询状态实时更新）
    inferTimerRef.current = window.setTimeout(() => {
      setStatus('inferencing')
      setStatusMessage('任务已提交，等待后端执行…')
    }, 600)

    try {
      const data = await submitRestoreTask({ imageFile, mode })

      const nextTaskId = data?.taskId || data?.id
      if (!nextTaskId) {
        throw new Error('接口返回缺少 taskId，请检查后端响应字段。')
      }

      setTaskId(String(nextTaskId))
      setStatus('inferencing')
      setStatusMessage('云端 GPU 推理中，请稍候…')

      pollingRef.current = window.setInterval(async () => {
        try {
          const task = await fetchTaskStatus(String(nextTaskId))
          setLogText(task?.logText || '')

          if (task?.status === 'done') {
            setResultUrl(resolveApiAssetUrl(task?.resultImageUrl || ''))
            setStatus('done')
            setStatusMessage('处理完成：已生成复原结果。')
            inFlightRef.current = false
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
            return
          }

          if (task?.status === 'failed') {
            setStatus('idle')
            setStatusMessage('')
            setErrorMessage(task?.errorMessage || '任务执行失败')
            inFlightRef.current = false
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
          }
        } catch (pollError) {
          setStatus('idle')
          setStatusMessage('')
          setErrorMessage(pollError?.message || '查询任务状态失败')
          inFlightRef.current = false
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
        }
      }, 2000)
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
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      if (inferTimerRef.current) {
        clearTimeout(inferTimerRef.current)
        inferTimerRef.current = null
      }
    }
  }, [])

  async function handleDownloadOriginal() {
    if (!previewUrl) return
    setIsDownloading(true)
    try {
      await downloadByUrl(previewUrl, imageFile?.name || 'original')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDownloadResult() {
    if (!resultUrl) return
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
        {/* 控制区 */}
        <section className="lg:col-span-4 space-y-4">
          <Card className="space-y-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
              <Settings2 size={16} aria-hidden="true" />
              参数配置
            </h3>

            <FileDropzone
              value={imageFile}
              error={fileError}
              onChange={(file, err) => {
                setImageFile(file)
                setFileError(err || '')
                setErrorMessage('')

                // 用户重新选择图片后，清理历史结果，避免误解
                setTaskId('')
                setResultUrl('')
                setLogText('')
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

              {taskId ? (
                <p className="text-xs text-slate-500">
                  任务 ID：<span className="font-mono">{taskId}</span>
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              说明
            </h3>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>上传图像后再点击“开始处理”。</li>
              <li>推理时长与图片大小、模型、GPU 资源有关。</li>
              <li>接口路径可在后端完成后按约定调整。</li>
            </ul>
          </Card>
        </section>

        {/* 结果区 */}
        <section className="lg:col-span-8 space-y-4">
          <Card className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                实验结果
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleDownloadOriginal}
                  disabled={!previewUrl || isDownloading}
                  className="gap-2"
                >
                  <Download size={15} aria-hidden="true" />
                  下载原图
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDownloadResult}
                  disabled={!resultUrl || isDownloading}
                  className="gap-2"
                >
                  <Download size={15} aria-hidden="true" />
                  下载结果
                </Button>
              </div>
            </div>

            <BeforeAfterSlider
              beforeSrc={previewUrl}
              afterSrc={resultUrl}
              disabled={status === 'uploading' || status === 'inferencing'}
            />
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
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">
              智能体推理过程（日志）
            </h3>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 p-3">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-emerald-200">
                {logText || '日志将在任务开始后显示（含命令输出与 workflow.log 片段）'}
              </pre>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
