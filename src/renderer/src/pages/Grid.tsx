import { useEffect, useRef, useState } from 'react'
import type { Tag } from '@shared/types'
import { am } from '../lib/am'
import { useLibrary } from '../store/useLibrary'
import AssetCard from '../components/AssetCard'

/** 搜索防抖 hook：停止输入 300ms 后才触发查询（避免每敲一个字母就查一次库） */
export function useDebouncedSearch(onChange: (v: string) => void, delayMs = 300): { value: string; set: (v: string) => void } {
  const [value, setValue] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cb = useRef(onChange)
  cb.current = onChange
  const set = (v: string): void => {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => cb.current(v), delayMs)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return { value, set }
}

const VIEW_LABELS: Record<string, string> = {
  all: '全部素材',
  model: '模型',
  material: '材质',
  texture: '贴图',
  reference: '参考图',
  other: '其他'
}

export default function Grid(): JSX.Element {
  const view = useLibrary((s) => s.view)
  const setView = useLibrary((s) => s.setView)
  const items = useLibrary((s) => s.items)
  const total = useLibrary((s) => s.total)
  const query = useLibrary((s) => s.query)
  const setQuery = useLibrary((s) => s.setQuery)
  const load = useLibrary((s) => s.load)

  const [thumbSize, setThumbSize] = useState(160)
  const [seriesTags, setSeriesTags] = useState<Tag[]>([])

  // 首次进入 / 视图切换：加载列表与系列标签
  useEffect(() => {
    void load()
  }, [query.category, query.seriesTagId])
  useEffect(() => {
    void am()
      .tags.list('series')
      .then(setSeriesTags)
  }, [])

  // 缩略图生成完成事件 → 刷新当前列表
  useEffect(() => {
    return am().onThumbsEvent(() => {
      void load()
    })
  }, [query])

  const onSearch = useDebouncedSearch((v) => {
    setQuery({ search: v || undefined, offset: 0 })
    void load()
  })

  const onPickSeries = (tagId: string | undefined): void => {
    setQuery({ seriesTagId: tagId, offset: 0 })
    void load()
  }

  const onLoadMore = (): void => {
    const next = items.length
    setQuery({ offset: next })
    void load(true)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background p-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => setView('home')} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent">
          ← 返回
        </button>
        <h1 className="text-lg font-semibold">{VIEW_LABELS[view] ?? view}</h1>
        <input
          value={onSearch.value}
          onChange={(e) => onSearch.set(e.target.value)}
          placeholder="搜索素材…"
          className="ml-auto w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          大小
          <input
            type="range"
            min={96}
            max={240}
            value={thumbSize}
            onChange={(e) => setThumbSize(Number(e.target.value))}
            className="w-24"
          />
        </label>
      </div>

      {seriesTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onPickSeries(undefined)}
            className={`rounded-full border px-3 py-1 text-xs ${
              !query.seriesTagId ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
            }`}
          >
            全部
          </button>
          {seriesTags.map((t) => (
            <button
              key={t.id}
              onClick={() => onPickSeries(t.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                query.seriesTagId === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
              }`}
            >
              🔗 {t.name}
            </button>
          ))}
        </div>
      )}

      <p className="mb-3 text-xs text-muted-foreground">共 {total} 个素材</p>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <span className="text-5xl">🗂</span>
          <p>这里还空着——去首页添加素材文件夹，或在设置里管理根目录</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} size={thumbSize} />
          ))}
        </div>
      )}

      {items.length < total && (
        <button onClick={onLoadMore} className="mx-auto mt-6 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
          加载更多（已显示 {items.length} / {total}）
        </button>
      )}
    </div>
  )
}
