import { useEffect, useState } from 'react'
import type { Root } from '@shared/types'
import { am } from '../lib/am'
import { useLibrary } from '../store/useLibrary'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

// 设置页（设计文档 §9）：根目录管理（含离线标记）、Blender 路径、渲染并发数、插件端口
export default function Settings(): JSX.Element {
  const setView = useLibrary((s) => s.setView)
  const [roots, setRoots] = useState<Root[]>([])
  const [newRoot, setNewRoot] = useState('')
  const [blenderPath, setBlenderPath] = useState('')
  const [concurrency, setConcurrency] = useState('2')
  const [port, setPort] = useState('8491')

  const refresh = async (): Promise<void> => {
    setRoots(await am().roots.list())
    setBlenderPath((await am().settings.get('blender_path')) ?? '')
    setConcurrency((await am().settings.get('thumbs_concurrency')) ?? '2')
    setPort((await am().settings.get('blender_port')) ?? '8491')
  }

  useEffect(() => {
    void refresh()
  }, [])

  const onAddRoot = async (): Promise<void> => {
    const p = newRoot.trim()
    if (!p) return
    try {
      await am().roots.add(p)
      setNewRoot('')
      await refresh()
    } catch (e) {
      setNewRoot(`目录不存在: ${p}`)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-8">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => setView('home')} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent">
          ← 返回
        </button>
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      <div className="max-w-xl space-y-8 text-sm">
        {/* 根目录 */}
        <section className="space-y-3">
          <h2 className="font-medium">素材根目录</h2>
          <div className="flex gap-2">
            <Input
              value={newRoot}
              onChange={(e) => setNewRoot(e.target.value)}
              placeholder="根目录路径，如 F:/素材"
              className="h-8"
            />
            <Button size="sm" onClick={() => void onAddRoot()} className="h-8">
              添加
            </Button>
          </div>
          <ul className="space-y-1.5">
            {roots.length === 0 && <li className="text-xs text-muted-foreground">还没有根目录——添加后应用会自动扫描入库</li>}
            {roots.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
                <span className="flex-1 truncate" title={r.path}>
                  {r.path}
                </span>
                {r.online === false ? (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">离线</span>
                ) : (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">在线</span>
                )}
                <button
                  onClick={() => void am().roots.remove(r.id).then(refresh)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Blender */}
        <section className="space-y-3">
          <h2 className="font-medium">Blender</h2>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">blender.exe 路径（生成 FBX/OBJ 缩略图需要）</p>
            <Input
              value={blenderPath}
              onChange={(e) => setBlenderPath(e.target.value)}
              onBlur={() => void am().settings.set('blender_path', blenderPath)}
              placeholder="如 D:/SteamLibrary/steamapps/common/Blender/blender.exe"
              className="h-8"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs">
              渲染并发数
              <Input
                type="number"
                min={1}
                max={4}
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                onBlur={() => void am().settings.set('thumbs_concurrency', concurrency)}
                className="h-8 w-20"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              插件端口
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                onBlur={() => void am().settings.set('blender_port', port)}
                className="h-8 w-24"
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
