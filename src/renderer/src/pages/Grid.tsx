import { useEffect, useRef, useState } from 'react'
import type { AssetRow, Tag } from '@shared/types'
import { am } from '../lib/am'
import { useLibrary } from '../store/useLibrary'
import AssetCard from '../components/AssetCard'
import DetailDrawer from '../components/DetailDrawer'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

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
  const smartName = useLibrary((s) => s.smartName)
  const setView = useLibrary((s) => s.setView)
  const items = useLibrary((s) => s.items)
  const total = useLibrary((s) => s.total)
  const query = useLibrary((s) => s.query)
  const setQuery = useLibrary((s) => s.setQuery)
  const load = useLibrary((s) => s.load)

  const [thumbSize, setThumbSize] = useState(160)
  const [seriesTags, setSeriesTags] = useState<Tag[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 分组视图（默认开）：同系列文件合并成一张组卡片——材质包整合显示（用户驱动需求）
  const [groupMode, setGroupMode] = useState(true)
  // 保存搜索为智能文件夹（B3）
  const [savingSearch, setSavingSearch] = useState(false)
  const [smartFolderName, setSmartFolderName] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

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
        <h1 className="text-lg font-semibold">{view === 'smart' ? `⭐ ${smartName}` : VIEW_LABELS[view] ?? view}</h1>
        <button
          onClick={() => setGroupMode((g) => !g)}
          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
          title="同系列文件合并为一张卡片"
        >
          {groupMode ? '📚 已分组' : '🗂 单文件'}
        </button>
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
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setSavingSearch((v) => !v)}
          title="把当前搜索条件保存为智能文件夹"
        >
          ⭐ 保存搜索
        </Button>
      </div>

      {savingSearch && (
        <div className="mb-4 flex items-center gap-2">
          <Input
            value={smartFolderName}
            onChange={(e) => setSmartFolderName(e.target.value)}
            placeholder="名称，如：最近 30 天"
            className="h-8 w-48 text-xs"
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const name = smartFolderName.trim()
              if (!name) return
              void am()
                .smart.add(name, query)
                .then(() => {
                  setSavingSearch(false)
                  setSmartFolderName('')
                  setSavedMsg('已保存 ✓')
                  setTimeout(() => setSavedMsg(''), 2000)
                })
            }}
          >
            保存
          </Button>
          {savedMsg && <span className="text-xs text-muted-foreground">{savedMsg}</span>}
        </div>
      )}

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
      ) : groupMode ? (
        <GroupedGrid
          items={items}
          thumbSize={thumbSize}
          tagName={(id) => seriesTags.find((t) => t.id === id)?.name ?? `系列:${id}`}
          onOpenGroup={(tagId) => {
            setGroupMode(false) // 点组卡片 = 进入该系列的平铺视图（复用系列筛选）
            onPickSeries(tagId)
          }}
          onOpenAsset={setSelectedId}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} size={thumbSize} onClick={() => setSelectedId(a.id)} />
          ))}
        </div>
      )}

      {items.length < total && (
        <button onClick={onLoadMore} className="mx-auto mt-6 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
          加载更多（已显示 {items.length} / {total}）
        </button>
      )}

      <DetailDrawer assetId={selectedId} open={selectedId !== null} onClose={() => setSelectedId(null)} onOpenAsset={setSelectedId} />
    </div>
  )
}

/** 分组视图：同系列（series_tag_id 相同）的文件合并为一张组卡片；无系列的文件单张显示 */
function GroupedGrid({
  items,
  thumbSize,
  tagName,
  onOpenGroup,
  onOpenAsset
}: {
  items: AssetRow[]
  thumbSize: number
  tagName: (id: string) => string
  onOpenGroup: (tagId: string) => void
  onOpenAsset: (id: string) => void
}): JSX.Element {
  const groups = new Map<string, AssetRow[]>()
  const singles: AssetRow[] = []
  for (const a of items) {
    if (a.series_tag_id) {
      const list = groups.get(a.series_tag_id) ?? []
      list.push(a)
      groups.set(a.series_tag_id, list)
    } else {
      singles.push(a)
    }
  }
  return (
    <div className="flex flex-wrap gap-3">
      {[...groups.entries()].map(([tagId, members]) => {
        const rep = members.find((m) => m.thumb_status === 'ready' && m.thumb_path) ?? members[0]
        return (
          <button
            key={tagId}
            onClick={() => onOpenGroup(tagId)}
            draggable
            onDragStart={(e) => {
              // 组卡片拖拽 = 拖整套 PBR 贴图（拖到 Blender 选中的模型上自动上材质）
              e.preventDefault()
              void am().startDragSet(rep.id)
            }}
            className="overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-ring"
            style={{ width: thumbSize }}
            title="点击展开该系列的全部文件；可拖到 Blender 中选中的模型上自动上材质"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
              {rep.thumb_status === 'ready' && rep.thumb_path ? (
                <img src={`thumb://local/${rep.id}.png`} alt={tagName(tagId)} className="h-full w-full object-cover" />
              ) : (
                <span className="text-4xl">🔗</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
              <span className="truncate text-xs" title={tagName(tagId)}>
                {tagName(tagId).replace(/^系列:/, '')}
              </span>
              <span className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                {members.length}
              </span>
            </div>
          </button>
        )
      })}
      {singles.map((a) => (
        <AssetCard key={a.id} asset={a} size={thumbSize} onClick={() => onOpenAsset(a.id)} />
      ))}
    </div>
  )
}
