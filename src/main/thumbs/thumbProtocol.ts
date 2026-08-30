import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * thumb:// 自定义协议：把缩略图目录作为受控资源提供给界面。
 * 为什么需要：开发模式下页面是 http://localhost，Chromium 禁止页面加载 file:// 本地资源——
 * 自定义协议是 Electron 官方推荐的正规通道，且能顺带做路径消毒（防穿越）。
 */

/** 协议路径 → 缩略图文件路径（消毒：只允许 thumbsDir 内的 .png，拒绝任何穿越） */
export function buildThumbPath(thumbsDir: string, pathname: string): string | null {
  try {
    const name = path.basename(decodeURIComponent(pathname))
    if (!name || name.includes('..') || !name.endsWith('.png')) return null
    return path.join(thumbsDir, name)
  } catch {
    return null
  }
}

export function registerThumbProtocol(thumbsDir: string): void {
  protocol.handle('thumb', (req) => {
    try {
      const u = new URL(req.url)
      const p = buildThumbPath(thumbsDir, u.pathname)
      if (!p) return new Response('bad request', { status: 400 })
      return net.fetch(pathToFileURL(p).toString())
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })
}
