import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * 调用 Blender 无界面模式渲染缩略图（设计文档 §3 并发模型：真并行靠独立进程，崩溃不拖累主程序）。
 * 返回面数/顶点数（与缩略图同一次调用产出——合并提取）；渲染失败返回 null。
 */
export async function renderAssetWithBlender(
  blenderExe: string,
  srcPath: string,
  outPng: string
): Promise<{ faces: number; vertices: number } | null> {
  const script = scriptPath()
  const metaJson = outPng + '.meta.json'
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn(blenderExe, ['-b', '-P', script, '--', srcPath, outPng, metaJson], {
        timeout: 5 * 60_000
      })
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`blender exit code ${code}`))))
      p.on('error', reject)
    })
    const meta = JSON.parse(await fs.readFile(metaJson, 'utf-8')) as { faces?: number; vertices?: number }
    await fs.rm(metaJson, { force: true })
    return { faces: meta.faces ?? 0, vertices: meta.vertices ?? 0 }
  } catch {
    return null
  }
}

/** 渲染脚本路径：Electron 环境用 app 资源目录；测试环境回退到相对工程根 */
function scriptPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: { getAppPath(): string } }
    if (electron?.app?.getAppPath) {
      return path.join(electron.app.getAppPath(), 'resources', 'scripts', 'render_asset.py')
    }
  } catch {
    // vitest 等无 electron 环境
  }
  return path.join(__dirname, '..', '..', '..', 'resources', 'scripts', 'render_asset.py')
}
