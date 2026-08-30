import { it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ingestFile, removeAsset, scanDirectory } from '../src/main/scan/ingest'
import { addRoot } from '../src/main/scan/roots'
import { openDb, migrate, getAssetByPath } from '../src/main/db'

it('ingestFile 入库并在删除事件后移除', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-test-'))
  const f = path.join(dir, '机甲.fbx')
  fs.writeFileSync(f, 'x'.repeat(100))
  const db = openDb(':memory:')
  migrate(db)
  const root = addRoot(db, dir)
  ingestFile(db, root.id, f)
  expect(getAssetByPath(db, root.id, '机甲.fbx')!.rel_path).toBe('机甲.fbx')
  removeAsset(db, root.id, '机甲.fbx')
  expect(getAssetByPath(db, root.id, '机甲.fbx')).toBeNull()
})

it('重复 ingest 同一文件返回同一个资产 id（重启扫描的回归测试）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-dup-'))
  const f = path.join(dir, '机甲.fbx')
  fs.writeFileSync(f, 'x'.repeat(100))
  const db = openDb(':memory:')
  migrate(db)
  const root = addRoot(db, dir)
  const id1 = ingestFile(db, root.id, f)
  const id2 = ingestFile(db, root.id, f) // 模拟重启后的全量扫描
  expect(id1).not.toBeNull()
  expect(id2).toBe(id1) // 幻影 id bug：以前这里会返回一个新 UUID，指向不存在的资产
  expect((db.prepare('SELECT COUNT(*) c FROM assets').get() as { c: number }).c).toBe(1)
})

it('scanDirectory 递归扫描并跳过目录文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-scan-'))
  fs.writeFileSync(path.join(dir, 'a.fbx'), 'x')
  fs.mkdirSync(path.join(dir, '子目录'))
  fs.writeFileSync(path.join(dir, '子目录', 'b.png'), 'x')
  fs.writeFileSync(path.join(dir, 'blender_assets.cats.txt'), 'VERSION 1\n') // 应跳过
  const db = openDb(':memory:')
  migrate(db)
  const root = addRoot(db, dir)
  const ids = scanDirectory(db, root.id)
  expect(ids).toHaveLength(2)
  expect(getAssetByPath(db, root.id, 'a.fbx')).not.toBeNull()
  expect(getAssetByPath(db, root.id, path.join('子目录', 'b.png'))).not.toBeNull()
  expect(getAssetByPath(db, root.id, 'blender_assets.cats.txt')).toBeNull()
})

it('扫描中某子目录消失不中断整个扫描（A6）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-race-'))
  fs.writeFileSync(path.join(dir, '存在.fbx'), 'x')
  const doomed = path.join(dir, '即将消失')
  fs.mkdirSync(doomed)
  fs.writeFileSync(path.join(doomed, '里面.png'), 'x')
  const db = openDb(':memory:')
  migrate(db)
  const root = addRoot(db, dir)
  // 测试钩子：walk 进入「即将消失」目录前把它删掉（模拟扫描与删除事件竞态）
  const ids = scanDirectory(db, root.id, {
    onDir: (abs) => {
      if (abs === doomed) fs.rmSync(doomed, { recursive: true, force: true })
    }
  })
  expect(ids).toHaveLength(1) // 只有 存在.fbx 入库
  expect(getAssetByPath(db, root.id, '存在.fbx')).not.toBeNull()
  // 没有抛出异常 = 目录消失被容错
})
