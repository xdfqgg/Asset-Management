// IPC 层：主进程与渲染进程之间的「电话总机」。
// 安全原则（设计文档 §9）：所有来自界面的参数必须白名单校验后才能进 SQL/文件系统——
// 渲染进程的代码用户可见可改，不能信任任何输入。
import fs from 'node:fs'
import type { AssetPatch, AssetQuery, Category, Root } from '../shared/types'
import {
  addTag,
  getAsset,
  getSetting,
  linkAssetTag,
  listAssets,
  listAssetTags,
  listTags,
  setSetting,
  unlinkAssetTag,
  updateAssetCategory,
  updateAssetNotes
} from './db'
import type { Db } from './db'
import { addRoot, listRoots, removeRoot } from './scan/roots'
import { assetAbsPath } from './thumbs/pipeline'
import { checkBlenderHealth, importToBlender } from './blender/client'

export interface IpcContext {
  db: Db
  broadcast: (channel: string, payload: unknown) => void
  /** 新增根目录后由主入口接管：写目录文件 + 全量扫描 + 缩略图入队 */
  onRootAdded: (root: Root) => void
  /** 设置变更回调（如并发数热更新队列） */
  onSettingsChanged?: (key: string, value: string) => void
}

const SORTS = ['name', 'size_bytes', 'mtime_ms', 'created_at'] as const
const CATEGORIES = ['model', 'material', 'texture', 'reference', 'other'] as const

/** 查询参数白名单校验：非法枚举值抛错（防注入），数值归一化（limit 上限 500） */
export function buildAssetQuery(raw: unknown): AssetQuery {
  const q = (raw ?? {}) as Record<string, unknown>
  if (q.sort !== undefined && !SORTS.includes(q.sort as never)) {
    throw new Error(`非法的 sort: ${String(q.sort)}`)
  }
  if (q.dir !== undefined && q.dir !== 'asc' && q.dir !== 'desc') {
    throw new Error(`非法的 dir: ${String(q.dir)}`)
  }
  if (q.category !== undefined && !CATEGORIES.includes(q.category as never)) {
    throw new Error(`非法的 category: ${String(q.category)}`)
  }
  if (q.tagIds !== undefined) {
    if (!Array.isArray(q.tagIds) || q.tagIds.length > 20 || q.tagIds.some((t) => typeof t !== 'string' || !t)) {
      throw new Error('非法的 tagIds（需字符串数组且不超过 20 个）')
    }
  }
  const limitNum = Math.trunc(Number(q.limit))
  const offsetNum = Math.trunc(Number(q.offset))
  return {
    search: typeof q.search === 'string' && q.search.trim() ? q.search.trim().slice(0, 100) : undefined,
    category: q.category as Category | undefined,
    seriesTagId: typeof q.seriesTagId === 'string' && q.seriesTagId ? q.seriesTagId : undefined,
    tagIds: q.tagIds as string[] | undefined,
    sort: q.sort as AssetQuery['sort'],
    dir: q.dir as AssetQuery['dir'],
    limit: Number.isFinite(limitNum) && limitNum >= 1 ? Math.min(limitNum, 500) : 60,
    offset: Number.isFinite(offsetNum) && offsetNum >= 0 ? offsetNum : 0
  }
}

// ---------- 可测试的纯 handler（不依赖 electron 运行时） ----------

export function handleRootsList(db: Db): unknown {
  return listRoots(db).map((r) => ({ ...r, online: fs.existsSync(r.path) }))
}

export function handleAssetsList(db: Db, raw: unknown): unknown {
  return listAssets(db, buildAssetQuery(raw))
}

export function handleAssetGet(db: Db, id: unknown): unknown {
  if (typeof id !== 'string' || !id) return null
  return getAsset(db, id)
}

export function handleAssetTags(db: Db, id: unknown): unknown {
  if (typeof id !== 'string' || !id) return []
  return listAssetTags(db, id)
}

export function handleTagsList(db: Db, type: unknown): unknown {
  if (type !== undefined && type !== 'normal' && type !== 'series') throw new Error('非法的标签类型')
  return listTags(db, type)
}

/** 详情面板修改资产：备注/大类/挂标签/摘标签，逐字段校验 */
export function handleAssetsUpdate(db: Db, id: unknown, raw: unknown): unknown {
  if (typeof id !== 'string' || !id) throw new Error('非法的 id')
  const p = (raw ?? {}) as Record<string, unknown>
  if (p.notes !== undefined && typeof p.notes !== 'string') throw new Error('notes 必须是字符串')
  if (p.category !== undefined && !CATEGORIES.includes(p.category as never)) throw new Error('非法的 category')
  if (p.addTagNames !== undefined) {
    if (!Array.isArray(p.addTagNames) || p.addTagNames.some((n) => typeof n !== 'string' || !n.trim())) {
      throw new Error('addTagNames 必须是字符串数组')
    }
  }
  if (p.removeTagIds !== undefined) {
    if (!Array.isArray(p.removeTagIds) || p.removeTagIds.some((n) => typeof n !== 'string')) {
      throw new Error('removeTagIds 必须是字符串数组')
    }
  }
  const patch = p as AssetPatch
  if (patch.notes !== undefined) updateAssetNotes(db, id, patch.notes)
  if (patch.category !== undefined) updateAssetCategory(db, id, patch.category)
  if (patch.addTagNames) {
    for (const name of patch.addTagNames) {
      const tag = addTag(db, name.trim(), 'normal')
      linkAssetTag(db, id, tag.id)
    }
  }
  if (patch.removeTagIds) {
    for (const tagId of patch.removeTagIds) unlinkAssetTag(db, id, tagId)
  }
  return getAsset(db, id)
}

export function handleSettingsGet(db: Db, key: unknown): unknown {
  if (typeof key !== 'string' || !key) return null
  return getSetting(db, key)
}

export function handleSettingsSet(db: Db, key: unknown, value: unknown): void {
  if (typeof key !== 'string' || !key) throw new Error('非法的 key')
  if (typeof value !== 'string') throw new Error('value 必须是字符串')
  setSetting(db, key, value)
}

function portSetting(db: Db): number {
  const raw = getSetting(db, 'blender_port')
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8491
}

export async function handleBlenderHealth(db: Db): Promise<boolean> {
  return checkBlenderHealth(portSetting(db))
}

export async function handleBlenderImport(db: Db, id: unknown, mode: unknown): Promise<void> {
  if (typeof id !== 'string' || !id) throw new Error('非法的 id')
  if (mode !== 'link' && mode !== 'append') throw new Error('mode 必须是 link 或 append')
  const abs = assetAbsPath(db, id)
  if (!abs) throw new Error('资产文件不存在')
  await importToBlender(portSetting(db), abs, mode, getSetting(db, 'blender_token') ?? undefined)
}

// ---------- 注册到 electron（仅运行时调用，测试环境不触碰） ----------

export function registerIpcHandlers(ctx: IpcContext): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ipcMain } = require('electron') as typeof import('electron')
  const { db } = ctx

  ipcMain.handle('roots:list', () => handleRootsList(db))
  ipcMain.handle('roots:add', (_e, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('非法的路径')
    const root = addRoot(db, path)
    ctx.onRootAdded(root)
    return listRoots(db)
  })
  ipcMain.handle('roots:remove', (_e, id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('非法的 id')
    removeRoot(db, id)
    return listRoots(db)
  })
  ipcMain.handle('assets:list', (_e, q: unknown) => handleAssetsList(db, q))
  ipcMain.handle('assets:get', (_e, id: unknown) => handleAssetGet(db, id))
  ipcMain.handle('assets:tags', (_e, id: unknown) => handleAssetTags(db, id))
  ipcMain.handle('tags:list', (_e, type: unknown) => handleTagsList(db, type))
  ipcMain.handle('assets:update', (_e, id: unknown, patch: unknown) => handleAssetsUpdate(db, id, patch))
  ipcMain.handle('settings:get', (_e, key: unknown) => handleSettingsGet(db, key))
  ipcMain.handle('settings:set', (_e, key: unknown, value: unknown) => {
    handleSettingsSet(db, key, value)
    if (typeof key === 'string' && typeof value === 'string') ctx.onSettingsChanged?.(key, value)
  })
  ipcMain.handle('blender:health', () => handleBlenderHealth(db))
  ipcMain.handle('blender:import', (_e, id: unknown, mode: unknown) => handleBlenderImport(db, id, mode))
  ipcMain.handle('assets:start-drag', (event, id: unknown) => {
    // OS 级文件拖拽（B2）：Blender 原生支持把文件从资源管理器拖进视口直接导入，
    // 这里让应用内卡片也能发起同样的拖拽
    if (typeof id !== 'string' || !id) throw new Error('非法的 id')
    const abs = assetAbsPath(db, id)
    if (!abs) throw new Error('资产文件不存在')
    const asset = getAsset(db, id)
    const icon = asset?.thumb_path && fs.existsSync(asset.thumb_path) ? asset.thumb_path : undefined
    event.sender.startDrag({ file: abs, icon })
  })
}
