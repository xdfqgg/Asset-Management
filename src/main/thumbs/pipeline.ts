import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { getAsset, getSetting, setThumbStatus, updateAssetMeta } from '../db'
import type { Db } from '../db'
import { extractBlendPreview } from './blendPreview'
import { renderAssetWithBlender } from './renderBlender'
import type { TaskQueue } from './queue'

// 分层缩略图策略（设计文档 §6）：.blend 提取内置预览 / 图片 sharp 缩放 / 模型 Blender 渲染 / 其他图标
// 快车道（图片、提取、借用预览）与慢车道（Blender 渲染）分离——图片不再排在渲染后面干等
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.hdr', '.webp', '.bmp'])
const MODEL_EXTS = new Set(['.fbx', '.obj', '.gltf', '.glb'])

// 材质包惯例预览图文件名（如 preview.png、thumbnail.jpg）
const PREVIEW_NAMES = ['preview', 'thumbnail', 'thumb', 'cover', 'image']

/**
 * 预览图借用：材质文件（.sbsar/.mat 等 Blender 也渲染不了的格式）通常和预览图放在一起——
 * 先找同名图片（机甲.sbsar → 机甲.png），再找 preview/thumbnail 等惯例名。
 * 找到就借用；找不到返回 null（走通用图标）。
 */
export function findPreviewImage(absPath: string): string | null {
  const dir = path.dirname(absPath)
  const base = path.basename(absPath, path.extname(absPath))
  const candidates = [
    ...[...IMAGE_EXTS].map((e) => path.join(dir, base + e)),
    ...PREVIEW_NAMES.flatMap((n) => [...IMAGE_EXTS].map((e) => path.join(dir, n + e)))
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
    } catch {
      // 继续找下一个
    }
  }
  return null
}

/** 资产在磁盘上的绝对路径（root.path + rel_path；watched folders 模式，文件留原地） */
export function assetAbsPath(db: Db, assetId: string): string | null {
  const row = db
    .prepare('SELECT a.rel_path, r.path AS root FROM assets a JOIN roots r ON r.id = a.root_id WHERE a.id = ?')
    .get(assetId) as { rel_path: string; root: string } | undefined
  return row ? path.join(row.root, row.rel_path) : null
}

/**
 * 把单个资产的缩略图任务入队。协程队列异步执行：
 * pending → processing → ready（缩略图 + 元信息就位）/ failed（兜底图标，不影响其他）
 */
export function enqueueThumbnail(db: Db, queue: TaskQueue, assetId: string, thumbsDir: string, force = false): void {
  const asset = getAsset(db, assetId)
  if (!asset) return
  // 已有缩略图的资产默认跳过重做（重启扫描不重复劳动）；文件变更事件用 force 强制重做
  if (!force && asset.thumb_status === 'ready' && asset.thumb_path && fs.existsSync(asset.thumb_path)) return
  const priority = MODEL_EXTS.has(asset.ext.toLowerCase()) ? 'low' : 'high'
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
        // 材质等不可渲染格式：借用材质包自带的预览图（同名图片 / preview.png 等惯例名）
        const preview = findPreviewImage(abs)
        if (preview) {
          await sharp(preview).resize(512, 512, { fit: 'cover' }).png().toFile(outPng)
          setThumbStatus(db, assetId, 'ready', outPng)
        } else {
          setThumbStatus(db, assetId, 'failed') // 都没有：前端渲染通用文件图标
        }
      }
    } catch {
      setThumbStatus(db, assetId, 'failed')
    }
  }, priority)
}

function requireBlenderExe(db: Db): string {
  const exe = getSetting(db, 'blender_path')
  if (!exe) throw new Error('未配置 Blender 路径（设置页可配置）')
  return exe
}
