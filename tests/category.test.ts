import { it, expect } from 'vitest'
import { categoryForExt } from '../src/main/meta/category'

it('扩展名映射大类', () => {
  expect(categoryForExt('.blend')).toBe('model')
  expect(categoryForExt('.fbx')).toBe('model')
  expect(categoryForExt('.png')).toBe('texture')
  expect(categoryForExt('.exr')).toBe('texture')
  expect(categoryForExt('.mtl')).toBe('material')
  expect(categoryForExt('.sbsar')).toBe('material')
  expect(categoryForExt('.mp3')).toBe('other')
  expect(categoryForExt('.BLEND')).toBe('model')
})
