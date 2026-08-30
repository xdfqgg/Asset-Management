import { it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { openDb, migrate, setSetting, getAsset } from '../src/main/db'
import { addRoot } from '../src/main/scan/roots'
import { ingestFile } from '../src/main/scan/ingest'
import { TaskQueue } from '../src/main/thumbs/queue'
import { enqueueThumbnail } from '../src/main/thumbs/pipeline'

vi.mock('../src/main/thumbs/renderBlender', () => ({
  renderAssetWithBlender: vi.fn().mockResolvedValue({ faces: 100, vertices: 80 })
}))

let db: ReturnType<typeof openDb>
let rootDir: string
let thumbsDir: string
let queue: TaskQueue

beforeEach(async () => {
  db = openDb(':memory:')
  migrate(db)
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-pipe-'))
  thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-thumbs-'))
  addRoot(db, rootDir)
  setSetting(db, 'blender_path', 'fake-blender.exe')
  queue = new TaskQueue(2)
})

async function waitDone(assetId: string): Promise<void> {
  const poll = setInterval(() => {
    const a = getAsset(db, assetId)
    if (a && (a.thumb_status === 'ready' || a.thumb_status === 'failed')) clearInterval(poll)
  }, 10)
  await new Promise((r) => setTimeout(r, 0))
  while (true) {
    const a = getAsset(db, assetId)
    if (a && (a.thumb_status === 'ready' || a.thumb_status === 'failed')) return
    await new Promise((r) => setTimeout(r, 20))
  }
}

it('图片：sharp 缩放 + 宽高元信息 + ready', async () => {
  const img = path.join(rootDir, '贴图.png')
  await sharp({ create: { width: 100, height: 50, channels: 3, background: 'red' } }).png().toFile(img)
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, img)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  const a = getAsset(db, id)!
  expect(a.thumb_status).toBe('ready')
  expect(fs.existsSync(a.thumb_path!)).toBe(true)
  expect(JSON.parse(a.meta_json)).toMatchObject({ width: 100, height: 50 })
})

it('.blend：提取内置预览并转 PNG', async () => {
  const src = path.join(rootDir, 'cube.blend')
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'cube-gzip.blend'), src)
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, src)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  const a = getAsset(db, id)!
  expect(a.thumb_status).toBe('ready')
  expect(fs.existsSync(a.thumb_path!)).toBe(true)
})

it('FBX：走 Blender 渲染 mock，面数写入 meta', async () => {
  const src = path.join(rootDir, '机甲.fbx')
  fs.writeFileSync(src, 'fake fbx content')
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, src)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  const a = getAsset(db, id)!
  expect(a.thumb_status).toBe('ready')
  expect(JSON.parse(a.meta_json)).toMatchObject({ faces: 100, vertices: 80 })
})

it('未知格式：标记 failed（前端显示通用图标）', async () => {
  const src = path.join(rootDir, '音效.mp3')
  fs.writeFileSync(src, 'fake mp3')
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, src)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  expect(getAsset(db, id)!.thumb_status).toBe('failed')
})

it('材质文件借用同文件夹的预览图（同名图片）', async () => {
  const src = path.join(rootDir, '机甲材质.sbsar')
  fs.writeFileSync(src, 'fake sbsar')
  // 材质包惯例：同名预览图放在一起
  await sharp({ create: { width: 64, height: 64, channels: 3, background: 'blue' } })
    .png()
    .toFile(path.join(rootDir, '机甲材质.png'))
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, src)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  const a = getAsset(db, id)!
  expect(a.thumb_status).toBe('ready')
  expect(fs.existsSync(a.thumb_path!)).toBe(true)
})

it('材质文件借用惯例名预览图（preview.png）', async () => {
  const src = path.join(rootDir, '墙体.sbsar')
  fs.writeFileSync(src, 'fake sbsar')
  await sharp({ create: { width: 64, height: 64, channels: 3, background: 'green' } })
    .png()
    .toFile(path.join(rootDir, 'preview.png'))
  const id = ingestFile(db, (db.prepare('SELECT id FROM roots').get() as { id: string }).id, src)!
  enqueueThumbnail(db, queue, id, thumbsDir)
  await waitDone(id)
  expect(getAsset(db, id)!.thumb_status).toBe('ready')
})
