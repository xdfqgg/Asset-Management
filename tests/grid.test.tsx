// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
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
            updated_at: ''
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
