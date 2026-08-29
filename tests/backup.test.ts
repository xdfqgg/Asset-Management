import { it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { backupDatabase, restoreLatestBackup } from '../src/main/db/backup'

it('备份保留最近 3 份（超过自动删最旧的）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-bk-'))
  const dbPath = path.join(dir, 'lib.db')
  fs.writeFileSync(dbPath, 'data')
  for (let i = 0; i < 5; i++) backupDatabase(dbPath, dir, 3)
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('backup-'))
  expect(backups).toHaveLength(3)
})

it('restoreLatestBackup 用最新备份恢复损坏的数据库', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-rst-'))
  const dbPath = path.join(dir, 'lib.db')
  fs.writeFileSync(dbPath, 'good-data')
  backupDatabase(dbPath, dir, 3)
  fs.writeFileSync(dbPath, 'corrupted!!!')
  expect(restoreLatestBackup(dbPath, dir)).toBe(true)
  expect(fs.readFileSync(dbPath, 'utf-8')).toBe('good-data')
})

it('没有备份时 restore 返回 false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-nobk-'))
  expect(restoreLatestBackup(path.join(dir, 'lib.db'), dir)).toBe(false)
})
