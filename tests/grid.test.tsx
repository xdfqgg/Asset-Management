// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react'
import Grid, { useDebouncedSearch } from '../src/renderer/src/pages/Grid'

it('输入 300ms 防抖后才触发查询', () => {
  vi.useFakeTimers()
  const fn = vi.fn()
  const { result } = renderHook(() => useDebouncedSearch(fn))
  act(() => result.current.set('机甲'))
  expect(fn).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(300))
  expect(fn).toHaveBeenCalledWith('机甲')
  vi.useRealTimers()
})

it('网格页渲染资产卡片、搜索框和系列标签筛选', async () => {
  vi.stubGlobal('am', {
    assets: {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'a1',
            root_id: 'r1',
            rel_path: '机甲.fbx',
            filename: '机甲.fbx',
            ext: '.fbx',
            size_bytes: 1024,
            mtime_ms: 0,
            category: 'model',
            name_root: null,
            meta_json: '{}',
            notes: '',
            thumb_path: null,
            thumb_status: 'failed',
            created_at: '',
            updated_at: '',
            series_tag_id: null
          }
        ],
        total: 1
      })
    },
    tags: {
      list: vi.fn().mockResolvedValue([{ id: 't1', name: '系列:机甲', type: 'series', created_at: '' }])
    },
    onThumbsEvent: vi.fn().mockReturnValue(() => {}),
    onAssetsEvent: vi.fn().mockReturnValue(() => {})
  })
  render(<Grid />)
  expect(await screen.findByText('机甲.fbx')).toBeTruthy()
  expect(screen.getByPlaceholderText(/搜索/)).toBeTruthy()
  expect(await screen.findByText(/系列:机甲/)).toBeTruthy()
})

it('保存当前搜索为智能文件夹（B3）', async () => {
  const smartAdd = vi.fn().mockResolvedValue({ id: 'sf1', name: '最近 30 天', query_json: '{}', created_at: '' })
  vi.stubGlobal('am', {
    assets: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    },
    tags: { list: vi.fn().mockResolvedValue([]) },
    smart: { add: smartAdd, list: vi.fn().mockResolvedValue([]), remove: vi.fn() },
    onThumbsEvent: vi.fn().mockReturnValue(() => {}),
    onAssetsEvent: vi.fn().mockReturnValue(() => {})
  })
  render(<Grid />)
  fireEvent.click(await screen.findByRole('button', { name: /保存搜索/ }))
  const input = await screen.findByPlaceholderText(/名称/)
  fireEvent.change(input, { target: { value: '我的搜索' } })
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }))
  await vi.waitFor(() => expect(smartAdd).toHaveBeenCalled())
  expect(smartAdd.mock.calls[0][0]).toBe('我的搜索')
  expect(smartAdd.mock.calls[0][1]).toMatchObject({ limit: 60, offset: 0 })
})

it('分组模式把同系列文件合并成一张组卡片（材质包整合显示）', async () => {
  const base = {
    root_id: 'r1',
    rel_path: 'x',
    size_bytes: 1024,
    mtime_ms: 0,
    category: 'model',
    name_root: null,
    meta_json: '{}',
    notes: '',
    thumb_path: null,
    thumb_status: 'failed',
    created_at: '',
    updated_at: ''
  }
  vi.stubGlobal('am', {
    assets: {
      list: vi.fn().mockResolvedValue({
        items: [
          { ...base, id: 'a1', filename: 'Ground103_2K-JPG.blend', ext: '.blend', series_tag_id: 's1' },
          { ...base, id: 'a2', filename: 'Ground103.png', ext: '.png', category: 'texture', series_tag_id: 's1' },
          { ...base, id: 'a3', filename: '单独.fbx', ext: '.fbx', series_tag_id: null }
        ],
        total: 3
      })
    },
    tags: {
      list: vi.fn().mockResolvedValue([{ id: 's1', name: '系列:Ground103', type: 'series', created_at: '' }])
    },
    onThumbsEvent: vi.fn().mockReturnValue(() => {}),
    onAssetsEvent: vi.fn().mockReturnValue(() => {})
  })
  render(<Grid />)
  // 默认分组模式：组卡片（显示系列名 + 成员数 2），无系列的单文件照常显示
  expect(await screen.findByText('Ground103')).toBeTruthy()
  expect(screen.getByText('2')).toBeTruthy()
  expect(screen.getByText('单独.fbx')).toBeTruthy()
  // 切成单文件模式：成员平铺显示
  fireEvent.click(screen.getByRole('button', { name: /已分组/ }))
  expect(await screen.findByText('Ground103_2K-JPG.blend')).toBeTruthy()
  expect(screen.getByText('Ground103.png')).toBeTruthy()
})
