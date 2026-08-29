import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import { upsertAsset, removeAssetByPath } from '../db'
import { categoryForExt } from '../meta/category'
import { extractNameRoot, maintainSeriesTags } from '../meta/seriesTags'

/**
 * 单文件入库（幂等）：解析文件信息 → upsert 进数据库 → 维护系列标签。
 * 返回资产 id；目录/不存在的文件返回 null。
 * watched folders 模式：文件留在原地，只建索引（设计文档 §7，Allusion 借鉴）。
 */
export function ingestFile(db: Database.Database, rootId: string, absPath: string): string | null {
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

export function removeAsset(db: Database.Database, rootId: string, relPath: string): void {
  removeAssetByPath(db, rootId, relPath)
  maintainSeriesTags(db)
}
