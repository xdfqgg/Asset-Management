import path from 'node:path'
import sharp from 'sharp'
import type { Database } from 'better-sqlite3'
import { getAsset, getSetting, setThumbStatus, updateAssetMeta } from '../db'
import { extractBlendPreview } from './blendPreview'
import { renderAssetWithBlender } from './renderBlender'
import type { TaskQueue } from './queue'

// 分层缩略图策略（设计文档 §6）：.blend 提取内置预览 / 图片 sharp 缩放 / 模型 Blender 渲染 / 其他图标
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.hdr', '.webp', '.bmp'])
const MODEL_EXTS = new Set(['.fbx', '.obj', '.gltf', '.glb'])

/** 资产在磁盘上的绝对路径（root.path + rel_path；watched folders 模式，文件留原地） */
export function assetAbsPath(db: Database.Database, assetId: string): string | null {
  const row = db
    .prepare('SELECT a.rel_path, r.path AS root FROM assets a JOIN roots r ON r.id = a.root_id WHERE a.id = ?')
    .get(assetId) as { rel_path: string; root: string } | undefined
  return row ? path.join(row.root, row.rel_path) : null
}

/**
 * 把单个资产的缩略图任务入队。协程队列异步执行：
 * pending → processing → ready（缩略图 + 元信息就位）/ failed（兜底图标，不影响其他）
 */
export function enqueueThumbnail(db: Database.Database, queue: TaskQueue, assetId: string, thumbsDir: string): void {
  queue.push(assetId, async () => {
    const asset = getAsset(db, assetId)
    if (!asset) return
    const abs = assetAbsPath(db, assetId)
    if (!abs) {
      setThumbStatus(db, assetId, 'failed')
      return
    }
    setThumbStatus(db, assetId, 'processing')
    try {
      const ext = asset.ext.toLowerCase()
      const outPng = path.join(thumbsDir, `${assetId}.png`)

      if (ext === '.blend') {
        const r = await extractBlendPreview(abs)
        if (r) {
          await sharp(r.rgba, { raw: { width: r.width, height: r.height, channels: 4 } })
            .resize(512, 512, { fit: 'contain' })
            .png()
            .toFile(outPng)
        } else {
          // 无内置预览（老文件/被剥过的文件）→ 回退 Blender 渲染
          const blenderExe = requireBlenderExe(db)
          await renderAssetWithBlender(blenderExe, abs, outPng)
        }
        setThumbStatus(db, assetId, 'ready', outPng)
      } else if (IMAGE_EXTS.has(ext)) {
        const info = await sharp(abs).metadata()
        await sharp(abs).resize(512, 512, { fit: 'cover' }).png().toFile(outPng)
        updateAssetMeta(db, assetId, { width: info.width, height: info.height })
        setThumbStatus(db, assetId, 'ready', outPng)
      } else if (MODEL_EXTS.has(ext)) {
        const blenderExe = requireBlenderExe(db)
        const meta = await renderAssetWithBlender(blenderExe, abs, outPng)
        if (meta) updateAssetMeta(db, assetId, meta) // 一次 Blender 调用拿两份数据（设计文档 §6）
        setThumbStatus(db, assetId, 'ready', outPng)
      } else {
        setThumbStatus(db, assetId, 'failed') // 其他格式：前端渲染通用文件图标
      }
    } catch {
      setThumbStatus(db, assetId, 'failed')
    }
  })
}

function requireBlenderExe(db: Database.Database): string {
  const exe = getSetting(db, 'blender_path')
  if (!exe) throw new Error('未配置 Blender 路径（设置页可配置）')
  return exe
}
