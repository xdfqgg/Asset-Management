import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { ZSTDDecoder } from 'zstddec'

// ============ .blend 文件格式（依据 Blender 官方源码 blenloader_core，2026-08 核实）============
//
// 【文件头 · 新版（Blender 5.x，17 字节）】
//   "BLENDER" + "17"(头部长度,2位ASCII) + '-'(8字节指针) + "01"(文件格式版本) + 'v'(小端) + "0502"(Blender版本)
// 【文件头 · 旧版（12 字节）】
//   "BLENDER" + 指针宽度('-'=8字节,'_'=4字节) + 字节序('v'小端) + 3字符版本号
// 【整文件压缩】Blender 5.x 的「压缩」= 整文件 zstd 流（魔数 28 B5 2F FD，即 LE 0xFD2FB528）
// 【数据块】新版 LargeBHead8 块头 32 字节：code(4)+SDNAnr(4)+old(8)+len(8)+nr(8)
//           旧版：BHead4 块头 20 字节 / SmallBHead8 块头 24 字节：code(4)+len(4)+old(4/8)+SDNAnr(4)+nr(4)
//           旧版开启「压缩」时每个块的数据单独 gzip；新版块数据不压缩（整个文件已经压过）
// 【预览图】code='TEST' 的块：数据 = 宽(int32 LE) + 高(int32 LE) + RGBA 像素
//
// 依据源码：
// - source/blender/blenloader_core/BLO_core_blend_header.hh、intern/blo_core_blend_header.cc
// - source/blender/blenloader_core/BLO_core_bhead.hh
// - source/blender/blenlib/intern/filereader_zstd.cc

const GZIP_MAGIC = 0x8b1f // 字节 1F 8B 按小端 uint16 读出的值
const ZSTD_MAGIC = 0xfd2fb528 // 字节 28 B5 2F FD 按小端 uint32 读出的值
const ZSTD_FILE_MAGIC = ZSTD_MAGIC // 整文件 zstd 流同魔数

let zstdDecoder: ZSTDDecoder | null = null
async function getZstd(): Promise<ZSTDDecoder> {
  if (!zstdDecoder) {
    zstdDecoder = new ZSTDDecoder()
    await zstdDecoder.init() // 加载 WASM 解码器（纯 JS 实现，无原生依赖）
  }
  return zstdDecoder
}

export interface BlendPreview {
  width: number
  height: number
  rgba: Buffer
}

/** 从 .blend 文件提取内置预览图；没有预览图/格式异常时返回 null（调用方回退到渲染方案） */
export async function extractBlendPreview(blendPath: string): Promise<BlendPreview | null> {
  let buf: Buffer
  try {
    buf = fs.readFileSync(blendPath)
  } catch {
    return null
  }
  // Blender 5.x 整文件 zstd 压缩 → 先整体解压
  if (buf.length >= 4 && buf.readUInt32LE(0) === ZSTD_FILE_MAGIC) {
    try {
      buf = Buffer.from(await (await getZstd()).decode(buf))
    } catch {
      return null
    }
  }
  if (buf.length < 12 || buf.toString('ascii', 0, 7) !== 'BLENDER') return null

  const b7 = buf.toString('ascii', 7, 8)
  if (b7 === '-' || b7 === '_') {
    // 旧版 12 字节头（注意：'-' = 8 字节指针，'_' = 4 字节指针——以官方源码为准）
    const ptrSize: 4 | 8 = b7 === '-' ? 8 : 4
    const little = buf.toString('ascii', 8, 9) === 'v'
    return parseLegacyBlocks(buf, ptrSize, little)
  }
  // 新版头：字节 7-8 是头部长度的 2 位 ASCII 数字（如 "17"）
  const headerSize = Number(buf.toString('ascii', 7, 9))
  if (!Number.isInteger(headerSize) || headerSize < 12 || headerSize > buf.length) return null
  return parseLargeBlocks(buf, headerSize)
}

/** 新版 LargeBHead8 块迭代（5.x 仅小端） */
function parseLargeBlocks(buf: Buffer, headerSize: number): BlendPreview | null {
  const HEADER = 32 // code(4)+SDNAnr(4)+old(8)+len(8)+nr(8)
  let off = headerSize
  while (off + HEADER <= buf.length) {
    const code = buf.toString('ascii', off, off + 4)
    const lenBig = buf.readBigUInt64LE(off + 16)
    if (lenBig > BigInt(buf.length)) return null
    const len = Number(lenBig)
    const dataOff = off + HEADER
    if (code === 'TEST' && len > 0 && dataOff + len <= buf.length) {
      const r = decodeTestPayload(buf.subarray(dataOff, dataOff + len))
      if (r) return r
    }
    off = dataOff + len
  }
  return null
}

/** 旧版 BHead4 / SmallBHead8 块迭代 */
function parseLegacyBlocks(buf: Buffer, ptrSize: 4 | 8, little: boolean): BlendPreview | null {
  const HEADER = 12 + ptrSize // code(4)+len(4)+old(ptrSize)+SDNAnr(4)+nr(4)
  const readU32 = (o: number): number => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  let off = 12
  while (off + HEADER <= buf.length) {
    const code = buf.toString('ascii', off, off + 4)
    const len = readU32(off + 4) // 旧版块长度是 32 位
    const dataOff = off + HEADER
    if (code === 'TEST' && len > 0 && dataOff + len <= buf.length) {
      const r = decodeTestPayload(buf.subarray(dataOff, dataOff + len))
      if (r) return r
    }
    off = dataOff + len
  }
  return null
}

/** TEST 块数据：可能被 gzip/zstd 压缩（旧版逐块压缩），解压后 = 宽 + 高 + RGBA */
async function decodeTestPayload(data: Buffer): Promise<BlendPreview | null> {
  try {
    let p: Buffer = data
    if (data.length >= 4) {
      const magic = data.readUInt32LE(0)
      if ((magic & 0xffff) === GZIP_MAGIC) {
        p = gunzipSync(data)
      } else if (magic === ZSTD_MAGIC) {
        p = Buffer.from(await (await getZstd()).decode(data))
      }
    }
    if (p.length < 8) return null
    const w = p.readInt32LE(0)
    const h = p.readInt32LE(4)
    if (w <= 0 || h <= 0) return null
    const rgba = p.subarray(8, 8 + w * h * 4)
    if (rgba.length !== w * h * 4) return null
    return { width: w, height: h, rgba }
  } catch {
    return null
  }
}
