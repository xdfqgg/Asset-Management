import { it, expect } from 'vitest'
import http from 'node:http'
import { checkBlenderHealth, importToBlender } from '../src/main/blender/client'

it('health 与 import 请求正确，且 import 带 token header（A9）', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.end('{"status":"ok"}')
      return
    }
    if (req.url === '/import') {
      expect(req.headers['x-assetmanagement-token']).toBe('test-token')
      let b = ''
      req.on('data', (d) => (b += d))
      req.on('end', () => {
        const body = JSON.parse(b)
        expect(body.mode).toBe('append')
        expect(body.textures).toEqual([{ path: 'F:/机甲_Albedo.png', role: 'albedo' }]) // 自动上材质载荷
        res.statusCode = 202
        res.end()
      })
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(18491, r))
  expect(await checkBlenderHealth(18491)).toBe(true)
  await importToBlender(18491, 'F:/t.fbx', 'append', 'test-token', [{ path: 'F:/机甲_Albedo.png', role: 'albedo' }])
  server.close()
})

it('插件返回非 2xx 时抛错', async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 401
    res.end('{"ok":false}')
  })
  await new Promise<void>((r) => server.listen(18492, r))
  await expect(importToBlender(18492, 'F:/t.fbx', 'link', 'bad-token')).rejects.toThrow(/401/)
  server.close()
})
