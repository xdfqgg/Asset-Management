import { describe, it, expect, beforeEach } from 'vitest'
import { buildAssetQuery, handleAssetsUpdate, handleSmartAdd } from '../src/main/ipc'
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

  it('tagIds 透传与校验（A4 回归）', () => {
    const q = buildAssetQuery({ tagIds: ['t1', 't2'], limit: 10, offset: 0 })
    expect(q.tagIds).toEqual(['t1', 't2'])
    expect(() => buildAssetQuery({ tagIds: 't1', limit: 10, offset: 0 })).toThrow()
    expect(() => buildAssetQuery({ tagIds: [123], limit: 10, offset: 0 })).toThrow()
    expect(() => buildAssetQuery({ tagIds: Array.from({ length: 21 }, (_, i) => `t${i}`), limit: 10, offset: 0 })).toThrow()
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

  it('智能文件夹：名称与查询校验（B3）', () => {
    const f = handleSmartAdd(db, ' 最近 30 天 ', { search: '机甲', limit: 60, offset: 0 }) as { name: string; query_json: string }
    expect(f.name).toBe('最近 30 天')
    expect(JSON.parse(f.query_json)).toMatchObject({ search: '机甲' })
    expect(() => handleSmartAdd(db, '', { limit: 10, offset: 0 })).toThrow()
    expect(() => handleSmartAdd(db, 'x'.repeat(51), { limit: 10, offset: 0 })).toThrow()
    expect(() => handleSmartAdd(db, '坏查询', { sort: 'evil', limit: 10, offset: 0 })).toThrow() // 查询也走白名单
  })
})
