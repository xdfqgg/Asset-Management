// PBR（基于物理的渲染）贴图角色识别（自动上材质功能）：
// 按行业命名惯例从文件名后缀判断这张贴图在材质里接哪个口
export type PbrRole = 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao'

const ROLE_SUFFIXES: { role: PbrRole; suffixes: string[] }[] = [
  { role: 'albedo', suffixes: ['albedo', 'basecolor', 'diffuse', 'color'] },
  { role: 'normal', suffixes: ['normal', 'nrm', 'bump'] },
  { role: 'roughness', suffixes: ['roughness', 'rough'] },
  { role: 'metallic', suffixes: ['metallic', 'metalness', 'metal'] },
  { role: 'ao', suffixes: ['ao', 'ambientocclusion', 'occlusion'] }
]

export function pbrRoleOf(filename: string): PbrRole | null {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase()
  for (const { role, suffixes } of ROLE_SUFFIXES) {
    for (const s of suffixes) {
      if (base === s || base.endsWith('_' + s) || base.endsWith('-' + s)) return role
    }
  }
  return null
}
