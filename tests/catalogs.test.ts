import { it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseCatalogs, serializeCatalogs, ensureCategoryCatalogs, CDF_FILENAME } from '../src/main/catalogs'
import { openDb, migrate } from '../src/main/db'

const SAMPLE = `VERSION 1
313ea471-7c81-4de6-af81-fb04c3535d0e:catalog/without/simple/name:
ee9c7b60-02f1-4058-bed6-539b8d2a6d34:character/Ellie/poselib:character-Ellie-poselib
`

it('解析与序列化 roundtrip', () => {
  const defs = parseCatalogs(SAMPLE)
  expect(defs).toHaveLength(2)
  expect(defs[1]).toEqual({
    uuid: 'ee9c7b60-02f1-4058-bed6-539b8d2a6d34',
    path: 'character/Ellie/poselib',
    simpleName: 'character-Ellie-poselib'
  })
  expect(parseCatalogs(serializeCatalogs(defs))).toEqual(defs)
})

it('ensureCategoryCatalogs 合并不覆盖已有条目，且幂等', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-cats-'))
  fs.writeFileSync(path.join(dir, CDF_FILENAME), SAMPLE)
  const db = openDb(':memory:')
  migrate(db)
  await ensureCategoryCatalogs(db, [dir])
  const cdfPath = path.join(dir, CDF_FILENAME)
  const defs = parseCatalogs(fs.readFileSync(cdfPath, 'utf-8'))
  expect(defs).toHaveLength(7) // 2 条已有 + 5 个大类
  expect(defs[0].path).toBe('catalog/without/simple/name') // 原条目原样保留
  expect(defs.map((d) => d.path)).toContain('模型')
  await ensureCategoryCatalogs(db, [dir])
  expect(parseCatalogs(fs.readFileSync(cdfPath, 'utf-8'))).toHaveLength(7) // 幂等
})
