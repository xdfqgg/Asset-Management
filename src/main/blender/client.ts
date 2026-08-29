// Blender 插件的 HTTP 客户端（设计文档 §8：插件内起本地 HTTP 服务，端口 8491 可配）
// 用 Node 18+ 内置 fetch，无需额外依赖；AbortSignal.timeout 控制超时

export async function checkBlenderHealth(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return false
    const json = (await res.json()) as { status?: string }
    return json.status === 'ok'
  } catch {
    return false
  }
}

export async function importToBlender(port: number, filePath: string, mode: 'link' | 'append'): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, mode }),
    signal: AbortSignal.timeout(10000)
  })
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`Blender 插件返回状态码 ${res.status}`)
  }
}
