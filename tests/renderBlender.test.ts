import { it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderAssetWithBlender } from '../src/main/thumbs/renderBlender'

// hoisted：mock 工厂与测试代码共享的可变状态（vitest 的 mock 提升机制）
const spawnMock = vi.hoisted(() => ({ args: [] as string[], exitCode: 0 }))

vi.mock('node:child_process', () => ({
  spawn: (_exe: string, args: string[]) => {
    spawnMock.args = args
    return {
      on: (ev: string, cb: (c?: number) => void) => {
        if (ev === 'exit') setTimeout(() => cb(spawnMock.exitCode), 0)
      },
      stderr: { on: () => {} },
      stdout: { on: () => {} }
    }
  }
}))

it('spawn 参数正确并解析 JSON 元信息', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'am-render-'))
  const outPng = path.join(tmp, 'out.png')
  // 模拟渲染脚本写出的元信息文件
  fs.writeFileSync(outPng + '.meta.json', JSON.stringify({ faces: 100, vertices: 80 }))

  const r = await renderAssetWithBlender('blender.exe', 'F:/t.fbx', outPng)

  expect(spawnMock.args).toContain('-b')
  expect(spawnMock.args).toContain('-P')
  expect(spawnMock.args.slice(-3)).toEqual(['F:/t.fbx', outPng, outPng + '.meta.json'])
  expect(r).toEqual({ faces: 100, vertices: 80 })
  // 元信息文件已被清理
  expect(fs.existsSync(outPng + '.meta.json')).toBe(false)
})

it('Blender 退出码非 0 时返回 null', async () => {
  spawnMock.exitCode = 1
  const r = await renderAssetWithBlender('blender.exe', 'F:/bad.fbx', 'F:/bad.png')
  expect(r).toBeNull()
  spawnMock.exitCode = 0
})
