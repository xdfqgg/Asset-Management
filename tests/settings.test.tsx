// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Settings from '../src/renderer/src/pages/Settings'

it('显示根目录列表与离线状态标记', async () => {
  vi.stubGlobal('am', {
    roots: {
      list: vi.fn().mockResolvedValue([
        { id: 'r1', path: 'F:/素材', enabled: true, online: true, created_at: '' },
        { id: 'r2', path: 'E:/移动硬盘素材', enabled: true, online: false, created_at: '' }
      ]),
      add: vi.fn(),
      remove: vi.fn()
    },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
    assets: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) }
  })
  render(<Settings />)
  expect(await screen.findByText(/F:\/素材/)).toBeTruthy()
  expect(await screen.findByText(/离线/)).toBeTruthy()
})

it('添加根目录调用 roots.add', async () => {
  const add = vi.fn().mockResolvedValue([])
  vi.stubGlobal('am', {
    roots: { list: vi.fn().mockResolvedValue([]), add, remove: vi.fn() },
    settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
    assets: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) }
  })
  render(<Settings />)
  const input = await screen.findByPlaceholderText(/根目录路径/)
  fireEvent.change(input, { target: { value: 'F:/我的素材' } })
  fireEvent.click(screen.getByRole('button', { name: /添加/ }))
  expect(add).toHaveBeenCalledWith('F:/我的素材')
})
