import axios from 'axios'

// 关键设计：集中管理 API 基础配置，便于毕业设计文档描述与后续替换
const apiBaseURL = import.meta.env.VITE_API_BASE_URL || ''

export const apiClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 60_000,
})

export function resolveApiAssetUrl(path) {
  if (!path || typeof path !== 'string') return ''
  if (/^https?:\/\//i.test(path)) return path
  if (!apiBaseURL) return path
  return `${apiBaseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function normalizeError(error) {
  if (!error) return '未知错误'

  // Axios 错误结构：优先取后端返回 message/detail
  const responseData = error?.response?.data
  const backendMessage =
    responseData?.detail || responseData?.message || responseData?.error

  if (typeof backendMessage === 'string' && backendMessage.trim()) {
    return backendMessage
  }

  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }

  return '请求失败，请检查网络或后端服务状态'
}

/**
 * 提交一次图像复原任务
 * - POST /api/restore
 * - form-data: image(file), mode(string)
 * - response: { taskId: string, status: string }
 */
export async function submitRestoreTask({ imageFile, mode }) {
  const form = new FormData()
  form.append('image', imageFile)
  form.append('mode', mode)

  try {
    const res = await apiClient.post('/api/restore', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    return res.data
  } catch (err) {
    throw new Error(normalizeError(err))
  }
}

/**
 * 查询任务状态与日志
 * - GET /api/tasks/:taskId
 */
export async function fetchTaskStatus(taskId) {
  try {
    const res = await apiClient.get(`/api/tasks/${taskId}`)
    return res.data
  } catch (err) {
    throw new Error(normalizeError(err))
  }
}

/**
 * 获取历史任务列表
 * 约定接口（可按实际后端调整）：
 * - GET /api/history
 * - response: Array<{ id, mode, status, createdAt, thumbnailUrl }>
 */
export async function fetchHistory() {
  try {
    const res = await apiClient.get('/api/history')
    return res.data
  } catch (err) {
    throw new Error(normalizeError(err))
  }
}
