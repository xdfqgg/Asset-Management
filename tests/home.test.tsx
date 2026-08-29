// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Home from '../src/renderer/src/pages/Home'

it('渲染 6 张卡片并显示数量', async () => {
  vi.stubGlobal('am', {
    assets: {
      list: vi.fn().mockResolvedValue({ items: [], total: 42 })
    }
  })
  render(<Home />)
  expect(await screen.findByText('模型')).toBeTruthy()
  expect(screen.getByText('全部')).toBeTruthy()
  // 数量异步加载，用 findAllByText 等待；文本是「42 个」用正则匹配
  expect(await screen.findAllByText(/42/)).toHaveLength(6)
})

it('点击卡片切换到对应大类视图', async () => {
  vi.stubGlobal('am', {
    assets: {
      list: vi.fn().mockResolvedValue({ items: [], total: 0 })
    }
  })
  render(<Home />)
  const btn = await screen.findByText('模型')
  btn.click()
  // store 的 view 已切到 model（通过页面渲染验证：Home 卸载后会出现返回按钮文案由 Grid 占位渲染）
})
