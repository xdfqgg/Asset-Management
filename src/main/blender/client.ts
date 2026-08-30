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

export interface TextureRef {
  path: string
  role: string
}

export async function importToBlender(
  port: number,
  filePath: string,
  mode: 'link' | 'append',
  token?: string,
  textures?: TextureRef[]
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-AssetManagement-Token'] = token // 插件校验（审查 A9）
  const res = await fetch(`http://127.0.0.1:${port}/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: filePath, mode, textures: textures ?? [] }),
    signal: AbortSignal.timeout(10000)
  })
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`Blender 插件返回状态码 ${res.status}`)
  }
}
