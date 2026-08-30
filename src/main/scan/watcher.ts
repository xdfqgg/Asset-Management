import chokidar, { FSWatcher } from 'chokidar'
import path from 'node:path'
import { ingestFile, removeAsset } from './ingest'
import type { Db } from '../db'

let watcher: FSWatcher | null = null
// 运行期间可增长的根目录列表（新增根目录要动态挂进监听——否则新根目录里的新文件没人盯）
let watchedRoots: { id: string; path: string }[] = []
let readyResolvers: (() => void)[] = []

/** 监听器基线扫描完成（ready）后 resolve——就绪前写入的文件会被 chokidar 当作「初始文件」忽略 */
export function whenWatcherReady(): Promise<void> {
  return watcher
    ? new Promise<void>((resolve) => {
        readyResolvers.push(resolve)
      })
    : Promise.resolve()
}

// Windows 路径归一化：大小写不敏感 + 斜杠统一，避免「路径写法不同导致匹配失败」
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase()
}

function rootOf(p: string): { id: string; path: string } | undefined {
  const n = norm(p)
  // 边界匹配（n === rn || n 以 rn/ 开头），且取最长匹配——两个根目录互为前缀时归属正确的那个
  return watchedRoots
    .map((r) => ({ r, rn: norm(r.path) }))
    .filter(({ rn }) => n === rn || n.startsWith(rn + '/'))
    .sort((a, b) => b.rn.length - a.rn.length)[0]?.r
}

/**
 * 启动文件监听（chokidar）：
 * - awaitWriteFinish：大文件还在拷贝中就触发 add 会读到半个文件，等稳定再入库（避坑清单）
 * - ignoreInitial：启动时不做全量扫描（全量扫描由调用方单独跑一遍）
 */
export function startWatcher(
  db: Db,
  onEvent: (type: 'add' | 'change' | 'unlink', assetId: string | null) => void,
  opts: { stabilityMs?: number } = {}
): void {
  const { stabilityMs = 2000 } = opts
  watchedRoots = db.prepare('SELECT id, path FROM roots WHERE enabled=1').all() as { id: string; path: string }[]
  watcher = chokidar.watch(
    watchedRoots.map((r) => r.path),
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: stabilityMs, pollInterval: 200 }
    }
  )

  watcher.on('ready', () => {
    for (const r of readyResolvers) r()
    readyResolvers = []
  })

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

/** 运行中添加根目录时调用：把新路径挂进 chokidar，实时监听立即生效 */
export function addRootToWatcher(rootId: string, rootPath: string): void {
  watchedRoots.push({ id: rootId, path: rootPath })
  watcher?.add(rootPath)
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
  watchedRoots = []
  readyResolvers = []
}
