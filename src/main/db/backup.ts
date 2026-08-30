import fs from 'node:fs'
import path from 'node:path'

/**
 * 数据库自动备份（设计文档 §9）：启动时执行一次。
 * 文件名带时间戳，只保留最近 keep 份（默认 3），旧的自动删除。
 */
/** 备份文件列表（按文件名排序 = 按时间排序）——审查 A11 提取的公共逻辑 */
export function listBackups(backupsDir: string): string[] {
  try {
    return fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
      .sort()
  } catch {
    return []
  }
}

export function backupDatabase(dbPath: string, backupsDir: string, keep = 3): string | null {
  try {
    if (!fs.existsSync(dbPath)) return null
    fs.mkdirSync(backupsDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = path.join(backupsDir, `backup-${stamp}.db`)
    fs.copyFileSync(dbPath, dest)
    const backups = listBackups(backupsDir)
    while (backups.length > keep) {
      fs.rmSync(path.join(backupsDir, backups.shift()!), { force: true })
    }
    return dest
  } catch {
    return null
  }
}

/** 数据库损坏时用最新备份恢复；没有备份返回 false */
export function restoreLatestBackup(dbPath: string, backupsDir: string): boolean {
  try {
    const backups = [...listBackups(backupsDir)].reverse()
    if (backups.length === 0) return false
    fs.copyFileSync(path.join(backupsDir, backups[0]), dbPath)
    return true
  } catch {
    return false
  }
}
