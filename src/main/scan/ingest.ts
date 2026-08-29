import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { upsertAsset, removeAssetByPath } from '../db'
import type { Db } from '../db'
import { categoryForExt } from '../meta/category'
import { extractNameRoot, maintainSeriesTags } from '../meta/seriesTags'

/**
 * 单文件入库（幂等）：解析文件信息 → upsert 进数据库 → 维护系列标签。
 * 返回资产 id；目录/不存在的文件返回 null。
 * watched folders 模式：文件留在原地，只建索引（设计文档 §7，Allusion 借鉴）。
 */
export function ingestFile(db: Db, rootId: string, absPath: string): string | null {
  try {
    const st = fs.statSync(absPath)
    if (!st.isFile()) return null
    const root = db.prepare('SELECT path FROM roots WHERE id=?').get(rootId) as { path: string } | undefined
    if (!root) return null
    const rel = path.relative(root.path, absPath)
    if (!rel || rel.startsWith('..')) return null // 不在根目录内
    const ext = path.extname(absPath)
    const id = randomUUID()
    upsertAsset(db, {
      id,
      root_id: rootId,
      rel_path: rel,
      filename: path.basename(absPath),
      ext,
      size_bytes: st.size,
      mtime_ms: st.mtimeMs,
      category: categoryForExt(ext),
      name_root: extractNameRoot(path.basename(absPath)),
      meta_json: '{}',
      notes: '',
      thumb_path: null,
      thumb_status: 'pending',
      created_at: '',
      updated_at: ''
    })
    maintainSeriesTags(db)
    return id
  } catch {
    return null
  }
}

export function removeAsset(db: Db, rootId: string, relPath: string): void {
  removeAssetByPath(db, rootId, relPath)
  maintainSeriesTags(db)
}

/**
 * 全量扫描一个根目录（启动时跑一次；增量交给 chokidar）。
 * 跳过：blender_assets.cats.txt（我们自己的目录文件）、备份文件（~ 结尾）、隐藏目录、缩略图目录。
 * 返回入库的资产 id 列表。
 */
export function scanDirectory(db: Db, rootId: string): string[] {
  const root = db.prepare('SELECT path FROM roots WHERE id=?').get(rootId) as { path: string } | undefined
  if (!root || !fs.existsSync(root.path)) return []
  const ids: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name.endsWith('.am-thumbs')) continue
        walk(abs)
      } else if (entry.isFile()) {
        if (entry.name === 'blender_assets.cats.txt' || entry.name.endsWith('~')) continue
        const id = ingestFile(db, rootId, abs)
        if (id) ids.push(id)
      }
    }
  }
  walk(root.path)
  return ids
}
