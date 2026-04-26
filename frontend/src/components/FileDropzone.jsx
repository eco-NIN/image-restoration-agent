import { useId, useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'

function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/')
}

export default function FileDropzone({
  value,
  values,
  onChange,
  error,
  multiple = false,
  directory = false,
}) {
  const inputId = useId()
  const inputRef = useRef(null)

  // 关键状态：拖拽交互的视觉反馈
  const [isDragging, setIsDragging] = useState(false)

  const selectedFiles = Array.isArray(values)
    ? values
    : value
      ? [value]
      : []
  const fileName = selectedFiles[0]?.name ?? ''
  const hintText = useMemo(() => {
    if (selectedFiles.length > 1) {
      return `已选择 ${selectedFiles.length} 张图片（首张：${fileName}）`
    }
    if (fileName) return `已选择：${fileName}`
    if (directory) {
      return '拖拽图片文件夹或点击选择文件夹（自动筛选其中的图片）'
    }
    if (multiple) {
      return '拖拽多张图片到此处，或点击选择文件（支持 PNG/JPG/WebP 等）'
    }
    return '拖拽图片到此处，或点击选择文件（支持 PNG/JPG/WebP 等）'
  }, [directory, fileName, multiple, selectedFiles.length])

  function pickFile() {
    inputRef.current?.click()
  }

  function handleFiles(files) {
    const list = Array.from(files || []).filter((file) => isImageFile(file))
    if (!list.length) {
      onChange?.(multiple ? [] : null, '请选择图片文件（image/*）')
      return
    }

    if (!multiple && !directory) {
      onChange?.(list[0], null)
      return
    }

    onChange?.(list, null)
  }

  return (
    <section aria-label="图片上传" className="space-y-2">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple || directory}
        {...(directory ? { webkitdirectory: '', directory: '' } : {})}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        onClick={pickFile}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={[
          'w-full rounded-xl border p-4 text-left shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
          isDragging
            ? 'border-blue-400 bg-blue-50 shadow-md'
            : error
              ? 'border-rose-300 bg-rose-50'
              : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ImagePlus size={16} aria-hidden="true" />
          上传输入图像
        </div>
        <p className="mt-1 text-sm text-slate-600">{hintText}</p>
      </button>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  )
}
