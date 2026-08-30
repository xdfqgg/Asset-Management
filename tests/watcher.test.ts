import { it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb, migrate, getAssetByPath } from '../src/main/db'
import { addRoot } from '../src/main/scan/roots'
import { startWatcher, stopWatcher, addRootToWatcher, whenWatcherReady } from '../src/main/scan/watcher'

async function waitFor(cond: () => boolean, timeoutMs = 10000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('等待超时')
    await new Promise((r) => setTimeout(r, 100))
  }
}

it('实时监听新文件入库（含运行中添加的根目录）', { timeout: 20000 }, async () => {
  const db = openDb(':memory:')
  migrate(db)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-watch-'))
  const root = addRoot(db, dir)

  startWatcher(db, () => {}, { stabilityMs: 200 })
  await whenWatcherReady() // 等基线扫描完成，否则新文件会被当作「初始文件」忽略

  // 启动时已存在的根目录：新文件应自动入库
  fs.writeFileSync(path.join(dir, '新模型.fbx'), 'x')
  await waitFor(() => getAssetByPath(db, root.id, '新模型.fbx') !== null)
  expect(getAssetByPath(db, root.id, '新模型.fbx')).not.toBeNull()

  // 运行中新增的根目录：加入监听后新文件也要能入库（本次 bug 的回归测试）
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'am-watch2-'))
  const root2 = addRoot(db, dir2)
  addRootToWatcher(root2.id, root2.path)
  await new Promise((r) => setTimeout(r, 500)) // 等新路径挂载完成
  fs.writeFileSync(path.join(dir2, '新贴图.png'), 'x')
  await waitFor(() => getAssetByPath(db, root2.id, '新贴图.png') !== null)
  expect(getAssetByPath(db, root2.id, '新贴图.png')).not.toBeNull()

  stopWatcher()
})
