import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDb, migrate, upsertAsset, getTagByName, listAssetTags } from '../src/main/db'
import { extractNameRoot, maintainSeriesTags, scheduleMaintainSeriesTags, flushSeriesTags } from '../src/main/meta/seriesTags'
import type { AssetRow } from '../src/shared/types'

describe('extractNameRoot', () => {
  it('剥离 PBR 后缀得到文件名根', () => {
    expect(extractNameRoot('机甲_Albedo.png')).toBe('机甲')
    expect(extractNameRoot('机甲_Normal.png')).toBe('机甲')
    expect(extractNameRoot('机甲_Roughness.png')).toBe('机甲')
    expect(extractNameRoot('机甲_v2.fbx')).toBe('机甲')
  })
  it('纯名字无后缀无分隔符的文件返回 null', () => {
    expect(extractNameRoot('机甲.fbx')).toBeNull()
    expect(extractNameRoot('texture.png')).toBeNull()
  })
})

describe('maintainSeriesTags', () => {
  let db: ReturnType<typeof openDb>
  beforeEach(() => {
    db = openDb(':memory:')
    migrate(db)
  })

  const asset = (over: Partial<AssetRow>): AssetRow =>
    ({
      id: 'x',
      root_id: 'r1',
      rel_path: 'f',
      filename: 'f',
      ext: '.f',
      size_bytes: 0,
      mtime_ms: 0,
      category: 'other',
      name_root: null,
      meta_json: '{}',
      notes: '',
      thumb_path: null,
      thumb_status: 'pending',
      created_at: '',
      updated_at: '',
      ...over
    }) as AssetRow

  it('schedule 去抖合并，flush 立即执行（A5）', async () => {
    vi.useFakeTimers()
    upsertAsset(db, asset({ id: 'm1', filename: '机甲.fbx', ext: '.fbx', rel_path: 'a', name_root: null }))
    upsertAsset(db, asset({ id: 'm2', filename: '机甲_Albedo.png', ext: '.png', rel_path: 'b', name_root: '机甲' }))
    scheduleMaintainSeriesTags(db)
    expect(getTagByName(db, '系列:机甲')).toBeNull() // 去抖期间不执行
    await vi.advanceTimersByTimeAsync(300)
    expect(getTagByName(db, '系列:机甲')).not.toBeNull() // 空闲后统一执行
    // flush：立即执行（启动扫描结束/退出前）
    db.prepare('DELETE FROM assets WHERE id=?').run('m2')
    scheduleMaintainSeriesTags(db)
    flushSeriesTags(db)
    expect(getTagByName(db, '系列:机甲')).toBeNull() // 只剩一名 → 立即解散
    vi.useRealTimers()
  })

  it('两名家族成员成系列（含无后缀根文件），只剩一名时解散', () => {
    upsertAsset(db, asset({ id: 'm1', filename: '机甲.fbx', ext: '.fbx', rel_path: 'a', name_root: null }))
    upsertAsset(db, asset({ id: 'm2', filename: '机甲_Albedo.png', ext: '.png', rel_path: 'b', name_root: '机甲' }))
    maintainSeriesTags(db)
    expect(getTagByName(db, '系列:机甲')).not.toBeNull()
    // 机甲.fbx 的 name_root 是 null，也要通过「文件名=根」规则挂上
    expect(listAssetTags(db, 'm1')).toHaveLength(1)
    expect(listAssetTags(db, 'm2')).toHaveLength(1)
    db.prepare('DELETE FROM assets WHERE id=?').run('m2')
    maintainSeriesTags(db)
    expect(getTagByName(db, '系列:机甲')).toBeNull()
  })
})
