import { it, expect } from 'vitest'
import { buildThumbPath } from '../src/main/thumbs/thumbProtocol'

it('把协议路径映射到缩略图目录内的文件', () => {
  expect(buildThumbPath('C:/thumbs', '/abc-def.png')).toBe('C:/thumbs/abc-def.png'.replace(/\//g, '\\'))
})

it('拒绝路径穿越与非法后缀', () => {
  expect(buildThumbPath('C:/thumbs', '/../library.db')).toBeNull()
  expect(buildThumbPath('C:/thumbs', '/..%2Flibrary.db')).toBeNull()
  expect(buildThumbPath('C:/thumbs', '/abc.txt')).toBeNull()
  expect(buildThumbPath('C:/thumbs', '')).toBeNull()
})
