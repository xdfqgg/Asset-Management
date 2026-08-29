import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getSetting, setSetting } from './db'
import type { Db } from './db'

// Blender 资产目录（asset catalogs）定义文件名——开放文本格式（调研文档 §4.3，官方规范）
export const CDF_FILENAME = 'blender_assets.cats.txt'

export interface CatalogDef {
  uuid: string
  path: string
  simpleName: string
}

/** 解析目录定义文件：每行 {UUID}:{路径}:{简单名}，跳过 VERSION 行与空行/#注释 */
export function parseCatalogs(text: string): CatalogDef[] {
  const defs: CatalogDef[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('VERSION ') || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const uuid = line.slice(0, i)
    const rest = line.slice(i + 1)
    const j = rest.indexOf(':')
    defs.push({
      uuid,
      path: j >= 0 ? rest.slice(0, j) : rest,
      simpleName: j >= 0 ? rest.slice(j + 1) : ''
    })
  }
  return defs
}

export function serializeCatalogs(defs: CatalogDef[]): string {
  return 'VERSION 1\n' + defs.map((d) => `${d.uuid}:${d.path}:${d.simpleName}`).join('\n') + '\n'
}

// 5 个大类与 Blender 目录一一对应（设计文档 §4）
const CATEGORY_CATALOGS = ['模型', '材质', '贴图', '参考图', '其他'] as const

/**
 * 确保每个素材根目录下都有含 5 个大类的目录定义文件：
 * - 已有条目原样保留（不覆盖 Blender 里建的目录）
 * - 大类缺哪个补哪个；UUID 持久化在 settings 里（跨根目录复用同一个 UUID）
 * - 全都在则不动文件
 */
export async function ensureCategoryCatalogs(db: Db, rootPaths: string[]): Promise<void> {
  for (const root of rootPaths) {
    const cdfPath = path.join(root, CDF_FILENAME)
    let defs: CatalogDef[] = []
    try {
      defs = parseCatalogs(await fs.readFile(cdfPath, 'utf-8'))
    } catch {
      // 文件不存在（Blender 还没建过）→ 从空开始
    }
    let changed = false
    for (const name of CATEGORY_CATALOGS) {
      if (defs.some((d) => d.path === name)) continue
      const key = `catalog_uuid_${name}`
      let uuid = getSetting(db, key)
      if (!uuid) {
        uuid = randomUUID()
        setSetting(db, key, uuid)
      }
      defs.push({ uuid, path: name, simpleName: '' })
      changed = true
    }
    if (changed) await fs.writeFile(cdfPath, serializeCatalogs(defs), 'utf-8')
  }
}
