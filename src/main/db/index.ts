import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { AssetRow, AssetQuery, AssetMeta, Category, Tag, TagType, ThumbStatus } from '../../shared/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS roots (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  root_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  mtime_ms INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other',
  name_root TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  thumb_path TEXT,
  thumb_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (root_id, rel_path)
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_name_root ON assets(name_root);
`

export function openDb(path: string): Database.Database {
  return new Database(path)
}

export function migrate(db: Database.Database): void {
  db.exec(SCHEMA)
}

// ---------- 资产 ----------

export function upsertAsset(db: Database.Database, a: AssetRow): void {
  db.prepare(
    `INSERT INTO assets (id,root_id,rel_path,filename,ext,size_bytes,mtime_ms,category,name_root,meta_json,notes,thumb_path,thumb_status,created_at,updated_at)
     VALUES (@id,@root_id,@rel_path,@filename,@ext,@size_bytes,@mtime_ms,@category,@name_root,@meta_json,@notes,@thumb_path,@thumb_status,datetime('now'),datetime('now'))
     ON CONFLICT(root_id,rel_path) DO UPDATE SET
       filename=excluded.filename, ext=excluded.ext, size_bytes=excluded.size_bytes,
       mtime_ms=excluded.mtime_ms, name_root=excluded.name_root, updated_at=datetime('now')`
  ).run(a)
}

export function getAsset(db: Database.Database, id: string): AssetRow | null {
  return (db.prepare('SELECT * FROM assets WHERE id=?').get(id) as AssetRow) ?? null
}

export function getAssetByPath(db: Database.Database, rootId: string, relPath: string): AssetRow | null {
  return (db.prepare('SELECT * FROM assets WHERE root_id=? AND rel_path=?').get(rootId, relPath) as AssetRow) ?? null
}

export function removeAssetByPath(db: Database.Database, rootId: string, relPath: string): void {
  db.prepare('DELETE FROM assets WHERE root_id=? AND rel_path=?').run(rootId, relPath)
}

export function setThumbStatus(db: Database.Database, id: string, status: ThumbStatus, thumbPath?: string | null): void {
  db.prepare('UPDATE assets SET thumb_status=?, thumb_path=COALESCE(?, thumb_path), updated_at=datetime(\'now\') WHERE id=?').run(
    status,
    thumbPath ?? null,
    id
  )
}

export function updateAssetMeta(db: Database.Database, id: string, meta: Partial<AssetMeta>): void {
  const row = getAsset(db, id)
  if (!row) return
  const merged = { ...JSON.parse(row.meta_json || '{}'), ...meta }
  db.prepare("UPDATE assets SET meta_json=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(merged), id)
}

export function updateAssetCategory(db: Database.Database, id: string, category: Category): void {
  db.prepare("UPDATE assets SET category=?, updated_at=datetime('now') WHERE id=?").run(category, id)
}

export function updateAssetNotes(db: Database.Database, id: string, notes: string): void {
  db.prepare("UPDATE assets SET notes=?, updated_at=datetime('now') WHERE id=?").run(notes, id)
}

export function listAssets(
  db: Database.Database,
  q: AssetQuery
): { items: AssetRow[]; total: number } {
  const where: string[] = []
  const params: Record<string, unknown> = {}
  if (q.search) {
    where.push('a.filename LIKE @search')
    params.search = `%${q.search}%`
  }
  if (q.category) {
    where.push('a.category = @category')
    params.category = q.category
  }
  if (q.seriesTagId) {
    where.push('a.id IN (SELECT asset_id FROM asset_tags WHERE tag_id=@seriesTagId)')
    params.seriesTagId = q.seriesTagId
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const sort = q.sort ?? 'name'
  const order = ['name', 'size_bytes', 'mtime_ms', 'created_at'].includes(sort) ? sort : 'name'
  // 排序键是面向调用方的名称，数据库列名可能不同（name → filename），在这里映射
  const col = order === 'name' ? 'filename' : order
  const dir = q.dir === 'desc' ? 'DESC' : 'ASC'
  const items = db
    .prepare(`SELECT * FROM assets a ${w} ORDER BY a.${col} ${dir} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: q.limit, offset: q.offset }) as AssetRow[]
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM assets a ${w}`).get(params) as { c: number }).c
  return { items, total }
}

/** 与某资产共用同一系列标签的其他资产（详情面板「同类素材」区） */
export function listAssetsWithSeries(db: Database.Database, seriesTagId: string, excludeAssetId: string): AssetRow[] {
  return db
    .prepare('SELECT a.* FROM assets a JOIN asset_tags at ON at.asset_id=a.id WHERE at.tag_id=? AND a.id<>?')
    .all(seriesTagId, excludeAssetId) as AssetRow[]
}

// ---------- 标签 ----------

export function addTag(db: Database.Database, name: string, type: TagType = 'normal'): Tag {
  const existing = getTagByName(db, name)
  if (existing) return existing
  const tag: Tag = { id: randomUUID(), name, type, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO tags (id, name, type, created_at) VALUES (?,?,?,?)').run(tag.id, tag.name, tag.type, tag.created_at)
  return tag
}

export function getTagByName(db: Database.Database, name: string): Tag | null {
  return (db.prepare('SELECT * FROM tags WHERE name=?').get(name) as Tag) ?? null
}

export function linkAssetTag(db: Database.Database, assetId: string, tagId: string): void {
  db.prepare('INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?,?)').run(assetId, tagId)
}

export function unlinkAssetTag(db: Database.Database, assetId: string, tagId: string): void {
  db.prepare('DELETE FROM asset_tags WHERE asset_id=? AND tag_id=?').run(assetId, tagId)
}

export function listAssetTags(db: Database.Database, assetId: string): Tag[] {
  return db.prepare('SELECT t.* FROM tags t JOIN asset_tags at ON at.tag_id=t.id WHERE at.asset_id=?').all(assetId) as Tag[]
}

// ---------- 设置 ----------

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
