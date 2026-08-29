import { useEffect, useState } from 'react'
import type { AssetRow, Category, Tag } from '@shared/types'
import { am } from '../lib/am'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'
import { Button } from './ui/button'
import TagEditor from './TagEditor'

const CATEGORY_LABELS: Record<Category, string> = {
  model: '模型',
  material: '材质',
  texture: '贴图',
  reference: '参考图',
  other: '其他'
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

/** 详情滑出面板（设计文档 §7）：大图/元信息/标签/备注/同类素材/导入 Blender */
export default function DetailDrawer({
  assetId,
  open,
  onClose,
  onOpenAsset
}: {
  assetId: string | null
  open: boolean
  onClose: () => void
  onOpenAsset?: (id: string) => void
}): JSX.Element {
  const [asset, setAsset] = useState<AssetRow | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const [related, setRelated] = useState<AssetRow[]>([])
  const [blenderOk, setBlenderOk] = useState(false)
  const [notes, setNotes] = useState('')
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    if (!open || !assetId) return
    let alive = true
    setImportMsg('')
    void (async () => {
      const a = await am().assets.get(assetId)
      if (!alive) return
      setAsset(a)
      setNotes(a?.notes ?? '')
      const ts = await am().assets.tags(assetId)
      if (!alive) return
      setTags(ts)
      // 同类素材 = 与本资产共用系列标签的其他资产（设计文档 §7）
      const rel: AssetRow[] = []
      for (const t of ts.filter((x) => x.type === 'series')) {
        const r = await am().assets.list({ seriesTagId: t.id, limit: 12, offset: 0 })
        rel.push(...r.items.filter((x) => x.id !== assetId))
      }
      if (alive) setRelated(rel)
      setBlenderOk(await am().blender.health())
    })()
    return () => {
      alive = false
    }
  }, [open, assetId])

  const update = async (patch: Record<string, unknown>): Promise<void> => {
    if (!assetId) return
    const a = await am().assets.update(assetId, patch)
    setAsset(a)
  }

  const onImport = async (mode: 'link' | 'append'): Promise<void> => {
    if (!assetId) return
    setImportMsg('导入中…')
    try {
      await am().blender.import(assetId, mode)
      setImportMsg('导入成功 ✓')
    } catch {
      setImportMsg('导入失败：Blender 未运行或插件未安装')
    }
  }

  const meta = asset ? (JSON.parse(asset.meta_json || '{}') as { faces?: number; vertices?: number; width?: number; height?: number }) : {}

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[380px] overflow-y-auto">
        {asset && (
          <>
            <SheetHeader>
              <SheetTitle className="truncate" title={asset.filename}>
                {asset.filename}
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-5 text-sm">
              {/* 大图 */}
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
                {asset.thumb_status === 'ready' && asset.thumb_path ? (
                  <img
                    src={`file:///${asset.thumb_path.replace(/\\/g, '/')}`}
                    alt={asset.filename}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-5xl">📦</span>
                )}
              </div>

              {/* 大类（可改，同步 Blender 目录体系） */}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">大类</span>
                <select
                  value={asset.category}
                  onChange={(e) => void update({ category: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1"
                >
                  {Object.entries(CATEGORY_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 元信息 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoCell label="格式" value={asset.ext} />
                <InfoCell label="大小" value={formatBytes(asset.size_bytes)} />
                {meta.faces !== undefined && <InfoCell label="面数" value={String(meta.faces)} />}
                {meta.vertices !== undefined && <InfoCell label="顶点数" value={String(meta.vertices)} />}
                {meta.width !== undefined && <InfoCell label="分辨率" value={`${meta.width}×${meta.height}`} />}
                <InfoCell label="修改时间" value={new Date(asset.mtime_ms).toLocaleDateString()} />
              </div>

              {/* 标签 */}
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">标签</p>
                <TagEditor
                  tags={tags}
                  onRemove={async (tagId) => {
                    await update({ removeTagIds: [tagId] })
                    setTags((ts) => ts.filter((t) => t.id !== tagId))
                  }}
                  onAdd={async (name) => {
                    await update({ addTagNames: [name] })
                    setTags((ts) => [...ts, { id: '', name, type: 'normal', created_at: '' }])
                  }}
                />
              </div>

              {/* 备注 */}
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">备注</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => void update({ notes })}
                  rows={3}
                  placeholder="写点备注…"
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* 同类素材（系列标签） */}
              {related.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">同类素材</p>
                  <div className="flex flex-wrap gap-2">
                    {related.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onOpenAsset?.(r.id)}
                        className="flex w-20 flex-col items-center gap-1 rounded-md border border-border p-1.5 hover:bg-accent"
                      >
                        <span className="text-2xl">🔗</span>
                        <span className="truncate text-[10px]" title={r.filename}>
                          {r.filename}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 导入 Blender（设计文档 §9：未连接时按钮置灰并提示） */}
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={!blenderOk} onClick={() => void onImport('link')}>
                    Link 引用
                  </Button>
                  <Button size="sm" className="flex-1" disabled={!blenderOk} onClick={() => void onImport('append')}>
                    Append 复制
                  </Button>
                </div>
                {!blenderOk && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Blender 未连接——请先打开 Blender 并启用 AssetManagement 插件（Task 14）
                  </p>
                )}
                {importMsg && <p className="text-xs">{importMsg}</p>}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function InfoCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md bg-muted px-2 py-1.5">
      <span className="text-muted-foreground">{label}：</span>
      {value}
    </div>
  )
}
