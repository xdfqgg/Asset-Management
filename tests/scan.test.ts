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
