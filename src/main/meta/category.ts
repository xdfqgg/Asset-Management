import type { Category } from '../../shared/types'

// 大类映射表（设计文档 §4）：默认按扩展名自动归类，详情面板可手动改单个资产的大类
const MAP: Record<string, Category> = {
  '.blend': 'model',
  '.fbx': 'model',
  '.obj': 'model',
  '.gltf': 'model',
  '.glb': 'model',
  '.usd': 'model',
  '.usda': 'model',
  '.usdc': 'model',
  '.abc': 'model',
  '.mtl': 'material',
  '.sbsar': 'material',
  '.sbs': 'material',
  '.mat': 'material',
  '.png': 'texture',
  '.jpg': 'texture',
  '.jpeg': 'texture',
  '.tga': 'texture',
  '.tif': 'texture',
  '.tiff': 'texture',
  '.exr': 'texture',
  '.hdr': 'texture',
  '.webp': 'texture',
  '.bmp': 'texture'
}

export function categoryForExt(ext: string): Category {
  return MAP[ext.toLowerCase()] ?? 'other'
}
