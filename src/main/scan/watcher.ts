import chokidar, { FSWatcher } from 'chokidar'
import path from 'node:path'
import type { Database } from 'better-sqlite3'
import { ingestFile, removeAsset } from './ingest'

let watcher: FSWatcher | null = null

/**
 * 启动文件监听（chokidar）：
 * - awaitWriteFinish：大文件还在拷贝中就触发 add 会读到半个文件，等 2 秒稳定再入库（避坑清单）
 * - ignoreInitial：启动时不做全量扫描（全量扫描由调用方单独跑一遍）
 */
export function startWatcher(db: Database.Database, onEvent: (type: 'add' | 'change' | 'unlink', assetId: string | null) => void): void {
  const roots = db.prepare('SELECT * FROM roots WHERE enabled=1').all() as { id: string; path: string }[]
  watcher = chokidar.watch(
    roots.map((r) => r.path),
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 }
    }
  )

  const rootOf = (p: string) => roots.find((r) => p.startsWith(r.path))

  watcher.on('add', (p) => {
    const root = rootOf(p)
    if (root) onEvent('add', ingestFile(db, root.id, p))
  })
  watcher.on('change', (p) => {
    const root = rootOf(p)
    if (root) onEvent('change', ingestFile(db, root.id, p))
  })
  watcher.on('unlink', (p) => {
    const root = rootOf(p)
    if (root) {
      removeAsset(db, root.id, path.relative(root.path, p))
      onEvent('unlink', null)
    }
  })
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}
