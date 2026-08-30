import { it, expect } from 'vitest'
import { pbrRoleOf } from '../src/main/meta/pbrRoles'

it('按 PBR 后缀识别贴图角色', () => {
  expect(pbrRoleOf('机甲_Albedo.png')).toBe('albedo')
  expect(pbrRoleOf('机甲_BaseColor.png')).toBe('albedo')
  expect(pbrRoleOf('机甲_Normal.png')).toBe('normal')
  expect(pbrRoleOf('机甲_Roughness.png')).toBe('roughness')
  expect(pbrRoleOf('机甲_Metallic.png')).toBe('metallic')
  expect(pbrRoleOf('机甲_AO.png')).toBe('ao')
  expect(pbrRoleOf('机甲_AO.jpg')).toBe('ao')
})

it('非 PBR 命名的文件返回 null', () => {
  expect(pbrRoleOf('机甲.png')).toBeNull()
  expect(pbrRoleOf('texture.png')).toBeNull()
  expect(pbrRoleOf('机甲.fbx')).toBeNull()
})
