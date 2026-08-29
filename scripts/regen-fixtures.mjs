// 从 cube-gzip.blend 生成两个衍生样本（可重复运行）：
// - cube-plain.blend：解压后原样保存 = 未压缩新版格式（含 TEST 预览块）
// - no-preview.blend：挖掉 TEST 块 = 真·无预览文件
import fs from 'node:fs'
import { ZSTDDecoder } from 'zstddec'

const dir = 'tests/fixtures'
const zstd = new ZSTDDecoder()
await zstd.init()

const buf = Buffer.from(zstd.decode(fs.readFileSync(`${dir}/cube-gzip.blend`)))
const headerSize = Number(buf.toString('ascii', 7, 9)) // 新版头："17"

function findTestBlock(b) {
  let off = headerSize
  while (off + 32 <= b.length) {
    if (b.toString('ascii', off, off + 4) === 'TEST') return off
    const len = Number(b.readBigUInt64LE(off + 16))
    off += 32 + len
  }
  return -1
}

fs.writeFileSync(`${dir}/cube-plain.blend`, buf)
console.log('wrote cube-plain.blend (', buf.length, 'bytes )')

const t = findTestBlock(buf)
if (t < 0) throw new Error('未找到 TEST 块')
const len = Number(buf.readBigUInt64LE(t + 16))
const stripped = Buffer.concat([buf.subarray(0, t), buf.subarray(t + 32 + len)])
fs.writeFileSync(`${dir}/no-preview.blend`, stripped)
console.log('wrote no-preview.blend (', stripped.length, 'bytes, TEST 块已挖掉 )')
