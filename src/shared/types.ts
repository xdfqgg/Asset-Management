// 主进程与渲染进程共享的类型定义（两侧都引用这一份，保证 IPC 数据形状一致）
export type Category = 'model' | 'material' | 'texture' | 'reference' | 'other'
export type ThumbStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type TagType = 'normal' | 'series'

export interface AssetRow {
  id: string
  root_id: string
  rel_path: string
  filename: string
  ext: string
  size_bytes: number
  mtime_ms: number
  category: Category
  name_root: string | null
  meta_json: string
  notes: string
  thumb_path: string | null
  thumb_status: ThumbStatus
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  type: TagType
  created_at: string
}

export interface AssetQuery {
  search?: string
  category?: Category
  tagIds?: string[]
  seriesTagId?: string
  sort?: 'name' | 'size_bytes' | 'mtime_ms' | 'created_at'
  dir?: 'asc' | 'desc'
  limit: number
  offset: number
}

export interface AssetMeta {
  faces?: number
  vertices?: number
  width?: number
  height?: number
}

export interface Root {
  id: string
  path: string
  enabled: boolean
  created_at: string
}

/** 详情面板对单个资产的修改（IPC 层严格校验后才落库） */
export interface AssetPatch {
  notes?: string
  category?: Category
  addTagNames?: string[]
  removeTagIds?: string[]
}
