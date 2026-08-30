// 冒烟测试（设计文档 §9）：Playwright 驱动真实 Electron 应用走主流程
// 前置：npm run build（out/ 已生成）+ better-sqlite3 处于 Electron ABI
import { it, expect } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

it(
  '冒烟：启动 → 添加根目录 → 资产出现 → 缩略图就绪',
  { timeout: 180000 },
  async () => {
    // 1) 准备临时素材目录（一张图片 + 一个模型文件）
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-e2e-root-'))
    await sharp({ create: { width: 300, height: 200, channels: 3, background: 'red' } })
      .png()
      .toFile(path.join(rootDir, '冒烟图.png'))
    fs.copyFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'cube.fbx'), path.join(rootDir, '冒烟模型.fbx'))

    // 2) 用临时 userData 启动应用（不污染真实数据）
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'am-e2e-data-'))
    const app: ElectronApplication = await electron.launch({
      args: ['.', `--user-data-dir=${userData}`]
    })
    try {
      const page = await app.firstWindow()
      await page.waitForSelector('text=AssetManagement', { timeout: 30000 })

      // 3) 设置页添加根目录
      await page.click('button:has-text("⚙ 设置")')
      await page.fill('input[placeholder*="根目录路径"]', rootDir)
      await page.click('button:has-text("添加")')
      await page.waitForSelector('text=/am-e2e-root-/', { timeout: 15000 })

      // 4) 回首页 → 进「全部」
      await page.click('button:has-text("← 返回")')
      await page.click('button:has-text("全部")')

      // 5) 资产出现（扫描 + 监听双通道都该生效）
      await page.waitForSelector('text=冒烟图.png', { timeout: 30000 })
      await page.waitForSelector('text=冒烟模型.fbx', { timeout: 30000 })

      // 6) 图片缩略图生成完毕（img 元素出现，说明 thumb:// 协议正常）
      await page.waitForSelector('img', { timeout: 60000 })
      expect(true).toBe(true)
    } finally {
      await app.close()
    }
  }
)
