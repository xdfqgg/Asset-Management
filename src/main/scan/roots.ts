import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Root } from '../../shared/types'
import type { Db } from '../db'

export function addRoot(db: Db, dir: string): Root {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`目录不存在: ${dir}`)
  }
  // 归一化存储：resolve 成原生绝对路径，后续拼接/匹配/监听都基于同一形态
  const root: Root = { id: randomUUID(), path: path.resolve(dir), enabled: true, created_at: new Date().toISOString() }
  db.prepare('INSERT INTO roots (id, path, enabled, created_at) VALUES (?,?,?,?)').run(
    root.id,
    root.path,
    root.enabled ? 1 : 0,
    root.created_at
  )
  return root
}

export function listRoots(db: Db): Root[] {
  return db.prepare('SELECT * FROM roots ORDER BY created_at').all() as Root[]
}

export function removeRoot(db: Db, id: string): void {
  db.prepare('DELETE FROM assets WHERE root_id=?').run(id)
  db.prepare('DELETE FROM roots WHERE id=?').run(id)
}
