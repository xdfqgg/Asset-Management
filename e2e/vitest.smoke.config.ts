// 冒烟测试专用 vitest 配置（npm run smoke 使用）：
// 独立 include 让它不参与默认单测发现；运行前提 = Electron ABI + npm run build
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src/renderer/src'),
      '@shared': resolve(__dirname, '../src/shared')
    }
  },
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    include: ['e2e/smoke.spec.ts'],
    environment: 'node',
    testTimeout: 180000
  }
})
