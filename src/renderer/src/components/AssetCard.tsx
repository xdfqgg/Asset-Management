import { useState } from 'react'
import type { AssetRow } from '@shared/types'

// 资产卡片：缩略图（带状态占位）+ 文件名
export default function AssetCard({
  asset,
  size,
  onClick
}: {
  asset: AssetRow
  size: number
  onClick?: () => void
}): JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)

  // 缩略图是本机文件，走 file:// 协议（CSP 已放行 file:）；Windows 路径反斜杠要转成斜杠
  const thumbUrl = asset.thumb_path ? `file:///${asset.thumb_path.replace(/\\/g, '/')}` : null

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring"
      style={{ width: size }}
      onClick={onClick}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
        {asset.thumb_status === 'ready' && thumbUrl && !imgFailed ? (
          <img src={thumbUrl} alt={asset.filename} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
        ) : asset.thumb_status === 'failed' ? (
          <span className="text-4xl">📦</span>
        ) : (
          <span className="animate-pulse text-xs text-muted-foreground">缩略图生成中…</span>
        )}
      </div>
      <div className="truncate px-2 py-1.5 text-xs" title={asset.filename}>
        {asset.filename}
      </div>
    </div>
  )
}
