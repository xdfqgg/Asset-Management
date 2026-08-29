// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import DetailDrawer from '../src/renderer/src/components/DetailDrawer'

const mockAsset = {
  id: 'a1',
  root_id: 'r1',
  rel_path: '机甲.fbx',
  filename: '机甲.fbx',
  ext: '.fbx',
  size_bytes: 2097152,
  mtime_ms: 1700000000000,
  category: 'model',
  name_root: null,
  meta_json: '{"faces":1000,"vertices":2000}',
  notes: '',
  thumb_path: null,
  thumb_status: 'failed',
  created_at: '',
  updated_at: ''
}

function stubAm(over: Record<string, unknown> = {}): void {
  vi.stubGlobal('am', {
    assets: {
      get: vi.fn().mockResolvedValue(mockAsset),
      tags: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      update: vi.fn().mockResolvedValue(mockAsset)
    },
    blender: { health: vi.fn().mockResolvedValue(false), import: vi.fn().mockResolvedValue(undefined) },
    ...over
  })
}

it('导入按钮在 Blender 未连接时置灰并提示', async () => {
  stubAm()
  render(<DetailDrawer assetId="a1" open onClose={() => {}} />)
  expect(await screen.findByText('机甲.fbx')).toBeTruthy()
  expect(await screen.findByText(/Blender 未连接/)).toBeTruthy()
  expect(screen.getByRole('button', { name: /Link/ })).toHaveProperty('disabled', true)
  expect(screen.getByRole('button', { name: /Append/ })).toHaveProperty('disabled', true)
})

it('元信息面板显示面数、顶点数和文件大小', async () => {
  stubAm({ blender: { health: vi.fn().mockResolvedValue(true), import: vi.fn().mockResolvedValue(undefined) } })
  render(<DetailDrawer assetId="a1" open onClose={() => {}} />)
  expect(await screen.findByText('1000')).toBeTruthy()
  expect(screen.getByText('2000')).toBeTruthy()
  expect(screen.getByText('2.0 MB')).toBeTruthy()
})

it('同类素材区渲染系列资产', async () => {
  stubAm({
    assets: {
      get: vi.fn().mockResolvedValue(mockAsset),
      tags: vi.fn().mockResolvedValue([{ id: 's1', name: '系列:机甲', type: 'series', created_at: '' }]),
      list: vi.fn().mockResolvedValue({
        items: [{ ...mockAsset, id: 'a2', filename: '机甲_Albedo.png', category: 'texture' }],
        total: 1
      }),
      update: vi.fn().mockResolvedValue(mockAsset)
    }
  })
  render(<DetailDrawer assetId="a1" open onClose={() => {}} />)
  expect(await screen.findByText('同类素材')).toBeTruthy()
  expect(await screen.findByText('机甲_Albedo.png')).toBeTruthy()
})
