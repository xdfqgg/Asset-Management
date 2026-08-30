import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // vitest 只读自己的配置——这里与 electron.vite.config.ts 的 renderer 别名保持一致
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  esbuild: {
    // 与 tsconfig 的 react-jsx 对齐：JSX 自动运行时，测试文件无需手动 import React
    jsx: 'automatic'
  },
  test: {
    // 开启全局 API（describe/it/expect 无需 import）+ 让 @testing-library/react 的自动清理生效
    globals: true,
    // e2e 冒烟测试需要 Electron ABI + 构建产物，不进默认单测跑（用 npm run smoke 单独跑）
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '**/out/**']
  }
})
