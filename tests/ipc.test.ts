import { describe, it, expect, beforeEach } from 'vitest'
import { buildAssetQuery, handleAssetsUpdate } from '../src/main/ipc'
import { openDb, migrate, upsertAsset, getAsset, listAssetTags } from '../src/main/db'
import type { AssetRow } from '../src/shared/types'

describe('buildAssetQuery（入参白名单校验）', () => {
  it('非法 sort 直接抛错（防 SQL 注入）', () => {
    expect(() => buildAssetQuery({ sort: 'evil; DROP TABLE assets', limit: 10, offset: 0 })).toThrow()
  })
  it('默认值与归一化', () => {
    const q = buildAssetQuery({ limit: 10, offset: 0 })
    expect(q.sort).toBeUndefined()
    expect(q.limit).toBe(10)
    // limit 上限 500
    expect(buildAssetQuery({ limit: 99999, offset: 0 }).limit).toBe(500)
    // 非数字 limit 回退默认 60
    expect(buildAssetQuery({ limit: 'abc', offset: 0 }).limit).toBe(60)
  })
})

describe('handleAssetsUpdate', () => {
  let db: ReturnType<typeof openDb>
  beforeEach(() => {
    db = openDb(':memory:')
    migrate(db)
    upsertAsset(db, {
      id: 'a1',
      root_id: 'r1',
      rel_path: '机甲.fbx',
      filename: '机甲.fbx',
      ext: '.fbx',
      size_bytes: 1,
      mtime_ms: 0,
      category: 'model',
      name_root: null,
      meta_json: '{}',
      notes: '',
      thumb_path: null,
      thumb_status: 'pending',
      created_at: '',
      updated_at: ''
    } as AssetRow)
  })

  it('改备注/大类/挂标签', () => {
    handleAssetsUpdate(db, 'a1', { notes: '主角机', category: 'texture', addTagNames: ['机甲', '硬表面'] })
    const a = getAsset(db, 'a1')!
    expect(a.notes).toBe('主角机')
    expect(a.category).toBe('texture')
    const tagNames = listAssetTags(db, 'a1').map((t) => t.name)
    expect(tagNames).toContain('机甲')
    expect(tagNames).toContain('硬表面')
  })

  it('非法 patch 抛错', () => {
    expect(() => handleAssetsUpdate(db, 'a1', { notes: 123 })).toThrow()
  })
})
