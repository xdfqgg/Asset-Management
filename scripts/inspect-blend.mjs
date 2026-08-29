// 盘点 .blend 文件里的 BHead 数据块类型（诊断工具，支持 Blender 5.x 整文件 zstd 压缩）
import fs from 'node:fs'
import { ZSTDDecoder } from 'zstddec'

const zstd = new ZSTDDecoder()
await zstd.init()

function load(f) {
  let buf = fs.readFileSync(f)
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0xfd2fb528) {
    buf = Buffer.from(zstd.decode(buf))
    console.log(f, '（整文件 zstd，解压后', buf.length, '字节）')
  }
  return buf
}

function tryHeader(buf, off) {
  // 块头 = code(4) + size(4/8) + oldptr(4/8) + sdna(4) + count(4)
  const ptrSize = buf.toString('ascii', off + 7, off + 8) === '-' ? 4 : 8
  return { ptrSize }
}

for (const f of process.argv.slice(2)) {
  const buf = load(f)
  // 先探测文件头：找 'BLENDER' 魔数位置
  const magicIdx = buf.toString('ascii').indexOf('BLENDER')
  console.log(f, '魔数位置:', magicIdx)
  if (magicIdx < 0) continue
  // Blender 5.x 头 16 字节（BLENDER+4字符版本+指针+字节序+3字符版本），老版 12 字节
  for (const headerSize of [12, 16]) {
    const ptrChar = buf.toString('ascii', magicIdx + 7, magicIdx + 8)
    const endianChar = buf.toString('ascii', magicIdx + 8, magicIdx + 9)
    console.log('  headerSize', headerSize, 'ptrChar=' + JSON.stringify(ptrChar), 'endianChar=' + JSON.stringify(endianChar))
  }
}
