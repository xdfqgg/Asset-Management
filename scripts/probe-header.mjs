// 探测 Blender 5.x 文件头：尝试不同块起始偏移 × 指针宽度，找出能完整切分文件的组合
import fs from 'node:fs'
import { ZSTDDecoder } from 'zstddec'

const zstd = new ZSTDDecoder()
await zstd.init()

const f = process.argv[2]
let buf = fs.readFileSync(f)
if (buf.length >= 4 && buf.readUInt32LE(0) === 0xfd2fb528) {
  buf = Buffer.from(zstd.decode(buf))
}

const printable = (s) => /^[\x20-\x7e]{4}$/.test(s)

for (let start = 12; start <= 24; start++) {
  for (const ptrSize of [4, 8]) {
    const little = buf.toString('ascii', 7, 9).includes('v') || buf.toString('ascii', start - 4, start) === 'v050'
    // 用文件里出现的字节序字符决定：找 'v' 或 'V' 在前 16 字节
    const endianChar = buf.toString('ascii', 0, 16).includes('v') ? 'v' : 'V'
    const le = endianChar === 'v'
    const readU = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
    const readUPtr = (o) => (ptrSize === 8 ? (le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o)) : BigInt(readU(o)))
    let off = start
    const codes = []
    let ok = true
    let blocks = 0
    while (off + 16 + 2 * ptrSize <= buf.length) {
      const code = buf.toString('ascii', off, off + 4)
      if (!printable(code)) { ok = false; break }
      const size = Number(readUPtr(off + 4))
      if (size < 0 || size > buf.length) { ok = false; break }
      codes.push(code)
      blocks++
      off += 16 + 2 * ptrSize + size
    }
    const exactEnd = off === buf.length
    if (ok && blocks > 5 && exactEnd) {
      console.log(`✅ start=${start} ptrSize=${ptrSize} blocks=${blocks} 结尾对齐=是`)
      console.log('   前10块:', codes.slice(0, 10).join(','))
      console.log('   含TEST:', codes.includes('TEST'))
    }
  }
}
console.log('探测完成')
