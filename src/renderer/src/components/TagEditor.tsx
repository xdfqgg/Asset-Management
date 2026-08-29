import { useState } from 'react'
import type { Tag } from '@shared/types'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'

// 标签编辑：展示已有标签（普通/系列🔗），可删除；输入新标签名回车/点按钮添加
export default function TagEditor({
  tags,
  onRemove,
  onAdd
}: {
  tags: Tag[]
  onRemove: (tagId: string) => void
  onAdd: (name: string) => void
}): JSX.Element {
  const [name, setName] = useState('')

  const add = (): void => {
    const v = name.trim()
    if (!v) return
    onAdd(v)
    setName('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">还没有标签</span>}
        {tags.map((t) => (
          <Badge key={t.id} variant={t.type === 'series' ? 'default' : 'secondary'} className="gap-1">
            {t.type === 'series' ? '🔗 ' : ''}
            {t.name}
            {t.type !== 'series' && (
              <button onClick={() => onRemove(t.id)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                ×
              </button>
            )}
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="新标签（回车添加）"
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-8 text-xs">
          添加
        </Button>
      </div>
    </div>
  )
}
