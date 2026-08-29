import { useEffect, useState } from 'react'
import type { Category } from '@shared/types'
import { am } from '../lib/am'
import { useLibrary } from '../store/useLibrary'

// 首页大类卡片（设计文档 §7：首页导航 + 下钻模式）
const CARDS: { c: Category | 'all'; label: string; icon: string }[] = [
  { c: 'model', label: '模型', icon: '🧊' },
  { c: 'material', label: '材质', icon: '🎨' },
  { c: 'texture', label: '贴图', icon: '🖼' },
  { c: 'reference', label: '参考图', icon: '📐' },
  { c: 'other', label: '其他', icon: '📦' },
  { c: 'all', label: '全部', icon: '⭐' }
]

export default function Home(): JSX.Element {
  const setView = useLibrary((s) => s.setView)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    void (async () => {
      const map: Record<string, number> = {}
      for (const card of CARDS) {
        const q = card.c === 'all' ? { limit: 1, offset: 0 } : { category: card.c, limit: 1, offset: 0 }
        map[card.c] = (await am().assets.list(q)).total
      }
      if (alive) setCounts(map)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background p-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">AssetManagement</h1>
          <p className="mt-1 text-sm text-muted-foreground">你的 Blender / UE 素材库</p>
        </div>
        <button
          onClick={() => setView('settings')}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          title="设置"
        >
          ⚙ 设置
        </button>
      </header>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map((card) => (
          <button
            key={card.c}
            onClick={() => setView(card.c)}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-card-foreground transition-colors hover:bg-accent"
          >
            <span className="text-4xl">{card.icon}</span>
            <span className="text-lg font-medium">{card.label}</span>
            <span className="text-sm text-muted-foreground">{counts[card.c] ?? '…'} 个</span>
          </button>
        ))}
      </div>
    </div>
  )
}
