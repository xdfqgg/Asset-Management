import { it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { extractBlendPreview } from '../src/main/thumbs/blendPreview'

it('从 .blend 提取预览图（整文件 zstd / 未压缩新版 / GZip 同名压缩版）', async () => {
  for (const f of ['cube.blend', 'cube-gzip.blend', 'cube-plain.blend']) {
    const r = await extractBlendPreview(path.join(__dirname, 'fixtures', f))
    expect(r).not.toBeNull()
    expect(r!.width).toBeGreaterThan(0)
    expect(r!.rgba.length).toBe(r!.width * r!.height * 4)
  }
})

it('没有预览图的 .blend 优雅返回 null（不抛异常）', async () => {
  // headless 保存的文件没有 TEST chunk——这是真实世界的常见情况
  const r = await extractBlendPreview(path.join(__dirname, 'fixtures', 'no-preview.blend'))
  expect(r).toBeNull()
})

it('旧版格式（12 字节头 + 逐块 gzip 压缩）也能提取', async () => {
  // 手工拼一个旧版 .blend：'-v400' 头 + 一个 gzip 压缩的 TEST 块
  const zlib = await import('node:zlib')
  const w = 2
  const h = 2
  const payload = Buffer.alloc(8 + w * h * 4)
  payload.writeInt32LE(w, 0)
  payload.writeInt32LE(h, 4)
  for (let i = 8; i < payload.length; i++) payload[i] = 200
  const gz = zlib.gzipSync(payload)
  const header = Buffer.from('BLENDER-v400')
  const block = Buffer.alloc(20) // BHead4：code(4)+len(4)+old(4)+SDNAnr(4)+nr(4)
  block.write('TEST', 0, 'ascii')
  block.writeUInt32LE(gz.length, 4)
  const file = Buffer.concat([header, block, gz])
  const tmp = path.join(__dirname, 'fixtures', 'legacy-synthetic.blend')
  fs.writeFileSync(tmp, file)
  const r = await extractBlendPreview(tmp)
  expect(r).not.toBeNull()
  expect(r!.width).toBe(2)
  expect(r!.rgba.length).toBe(16)
  fs.unlinkSync(tmp)
})
