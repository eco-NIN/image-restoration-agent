export async function downloadByUrl(url, filename) {
  if (!url) throw new Error('下载地址为空')

  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`下载失败（${res.status}）`)
    const blob = await res.blob()

    const objectUrl = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename || 'download'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch (e) {
    // 防御性：跨域/鉴权导致 fetch blob 失败时，回退为新窗口打开
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
