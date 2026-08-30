import { it, expect, beforeEach } from 'vitest'
import {
  openDb,
  migrate,
  upsertAsset,
  getAsset,
  addTag,
  linkAssetTag,
  listAssets,
  addSmartFolder,
  listSmartFolders,
  removeSmartFolder
} from '../src/main/db'
import type { AssetRow } from '../src/shared/types'

let db: ReturnType<typeof openDb>
beforeEach(() => {
  db = openDb(':memory:')
  migrate(db)
})

const asset = (over: Partial<AssetRow> = {}): AssetRow => ({
  id: 'a1',
  root_id: 'r1',
  rel_path: 'sub/机甲.fbx',
  filename: '机甲.fbx',
  ext: '.fbx',
  size_bytes: 1024,
  mtime_ms: 0,
  category: 'model',
  name_root: '机甲',
  meta_json: '{}',
  notes: '',
  thumb_path: null,
  thumb_status: 'pending',
  created_at: '',
  updated_at: '',
  ...over
})

it('upsert 按 (root_id, rel_path) 去重', () => {
  upsertAsset(db, asset())
  upsertAsset(db, asset({ size_bytes: 2048 }))
  expect(getAsset(db, 'a1')!.size_bytes).toBe(2048)
})

it('按大类 + 关键词 + 标签筛选', () => {
  upsertAsset(db, asset())
  const tag = addTag(db, '系列:机甲', 'series')
  linkAssetTag(db, 'a1', tag.id)
  const r = listAssets(db, { category: 'model', search: '机甲', limit: 20, offset: 0 })
  expect(r.total).toBe(1)
  const r2 = listAssets(db, { category: 'texture', limit: 20, offset: 0 })
  expect(r2.total).toBe(0)
})

it('按 tagIds 过滤资产（A4 回归：具名参数）', () => {
  upsertAsset(db, asset({ id: 'm1' }))
  upsertAsset(db, asset({ id: 'm2', rel_path: 'b', filename: '机甲_Albedo.png', name_root: '机甲' }))
  const tag = addTag(db, '机甲', 'normal')
  linkAssetTag(db, 'm1', tag.id)
  const r = listAssets(db, { tagIds: [tag.id], limit: 20, offset: 0 })
  expect(r.total).toBe(1)
  expect(r.items[0].id).toBe('m1')
})

it('智能文件夹 CRUD（B3）', () => {
  const f = addSmartFolder(db, '最近 30 天', JSON.stringify({ search: '机甲', limit: 60, offset: 0 }))
  expect(listSmartFolders(db)).toHaveLength(1)
  expect(listSmartFolders(db)[0].name).toBe('最近 30 天')
  removeSmartFolder(db, f.id)
  expect(listSmartFolders(db)).toHaveLength(0)
})

it('listAssets 附带每个资产的系列标签 id（供界面分组）', () => {
  upsertAsset(db, asset({ id: 'm1' }))
  upsertAsset(db, asset({ id: 'm2', rel_path: 'b', filename: '机甲_Albedo.png', name_root: '机甲' }))
  const tag = addTag(db, '系列:机甲', 'series')
  linkAssetTag(db, 'm1', tag.id)
  linkAssetTag(db, 'm2', tag.id)
  const r = listAssets(db, { limit: 20, offset: 0 })
  expect(r.items.find((i) => i.id === 'm1')!.series_tag_id).toBe(tag.id)
  expect(r.items.find((i) => i.id === 'm2')!.series_tag_id).toBe(tag.id)
})
