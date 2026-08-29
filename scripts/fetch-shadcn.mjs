// 从 shadcn 官方 registry 下载组件源码（等价于 `npx shadcn add`，但非交互式，可脚本化）
// 用法: node scripts/fetch-shadcn.mjs button badge input sheet
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BASE = 'https://ui.shadcn.com/r/styles/new-york-v4'
const names = process.argv.slice(2)
const root = process.cwd()

if (names.length === 0) {
  console.error('用法: node scripts/fetch-shadcn.mjs <组件名...>')
  process.exit(1)
}

for (const name of names) {
  const res = await fetch(`${BASE}/${name}.json`)
  if (!res.ok) {
    console.error(`FAIL ${name}: HTTP ${res.status}`)
    continue
  }
  const item = await res.json()
  for (const f of item.files ?? []) {
    const target = join(root, 'src/renderer/src', f.path.replace(/^registry\/new-york-v4\//, ''))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, f.content)
    console.log('wrote', target)
  }
}
