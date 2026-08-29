import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    // 与 tsconfig 的 react-jsx 对齐：JSX 自动运行时，测试文件无需手动 import React
    jsx: 'automatic'
  },
  test: {
    // 开启全局 API（describe/it/expect 无需 import）+ 让 @testing-library/react 的自动清理生效
    globals: true
  }
})
