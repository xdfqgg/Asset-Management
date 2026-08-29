import { it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ingestFile, removeAsset } from '../src/main/scan/ingest'
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
