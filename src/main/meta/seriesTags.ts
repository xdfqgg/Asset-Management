import { addTag } from '../db'
import type { Db } from '../db'

// PBR（基于物理的渲染）贴图的行业命名后缀：机甲_Albedo、机甲_Normal、机甲_Roughness…
const PBR_SUFFIXES = [
  'albedo',
  'basecolor',
  'normal',
  'roughness',
  'metallic',
  'ao',
  'height',
  'displacement',
  'emissive',
  'opacity',
  'orm',
  'gloss',
  'specular'
]

/**
 * 从文件名提取「系列根」。
 * 规则（与设计文档 §4 一致）：
 * 1. 剥掉 PBR 后缀和尾部分隔符（机甲_Albedo.png → 机甲）
 * 2. 没有 PBR 后缀时，按第一个分隔符切（机甲_v2.fbx → 机甲）
 * 3. 纯名字（无后缀无分隔符，如 texture.png）返回 null——它不主动建系列，
 *    但会通过 maintainSeriesTags 的「文件名=根」规则挂进别人建立的系列
 */
export function extractNameRoot(filename: string): string | null {
  let base = filename.replace(/\.[^.]+$/, '')
  const lower = base.toLowerCase()
  let stripped = false
  for (const s of PBR_SUFFIXES) {
    if (lower.endsWith(s)) {
      base = base.slice(0, -s.length)
      stripped = true
      break
    }
  }
  base = base.replace(/[_\-\s]+$/g, '')
  if (!stripped) {
    const m = base.match(/^(.+?)[_\-\s]/)
    if (!m) return null
    base = m[1]
  } else if (/[_\-\s]/.test(base)) {
    base = base.split(/[_\-\s]/)[0]
  }
  return base.length >= 2 ? base : null
}

/**
 * 系列标签自动维护（幂等，入库/删除后调用）：
 * - name_root 相同且 ≥2 个资产 → 创建系列标签 `系列:{根}` 并挂给所有家族成员
 * - 家族成员 = name_root 等于根 的资产 ∪ 文件名（去扩展名）正好等于根 的资产
 *   （如 机甲.fbx 配 机甲_Albedo.png，让源模型文件也能进家族）
 * - 家族只剩 1 人 → 解散（删标签，级联删关联）
 */
export function maintainSeriesTags(db: Db): void {
  // 家族成员 = name_root 等于根 的资产 ∪ 文件名（去扩展名）等于根 的资产
  const memberCount = db.prepare(
    `SELECT COUNT(*) AS c FROM assets
     WHERE name_root = ? OR (name_root IS NULL AND substr(filename, 1, length(filename) - length(ext)) = ?)`
  )
  const candidates = db.prepare('SELECT DISTINCT name_root AS r FROM assets WHERE name_root IS NOT NULL').all() as {
    r: string
  }[]
  const valid = candidates.filter(({ r }) => (memberCount.get(r, r) as { c: number }).c >= 2).map(({ r }) => r)

  if (valid.length === 0) {
    db.prepare("DELETE FROM tags WHERE type='series' AND name LIKE '系列:%'").run()
  } else {
    const names = valid.map((r) => `系列:${r}`)
    const ph = names.map(() => '?').join(',')
    db.prepare(`DELETE FROM tags WHERE type='series' AND name LIKE '系列:%' AND name NOT IN (${ph})`).run(...names)
  }

  for (const R of valid) {
    const tag = addTag(db, `系列:${R}`, 'series')
    db.prepare(
      `INSERT OR IGNORE INTO asset_tags (asset_id, tag_id)
       SELECT a.id, ? FROM assets a
       WHERE a.name_root = ?
          OR (a.name_root IS NULL AND substr(a.filename, 1, length(a.filename) - length(a.ext)) = ?)`
    ).run(tag.id, R, R)
  }
}
