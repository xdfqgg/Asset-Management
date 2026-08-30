import { create } from 'zustand'
import type { AssetQuery, AssetRow, Category } from '@shared/types'
import { am } from '../lib/am'

// zustand：轻量状态管理（比 Redux 少一层样板）。整个界面的共享状态都在这里。
type View = 'home' | 'all' | 'settings' | 'smart' | Category

interface LibState {
  view: View
  query: AssetQuery
  items: AssetRow[]
  total: number
  smartName: string
  setView(v: View): void
  setQuery(patch: Partial<AssetQuery>): void
  openSmart(name: string, query: AssetQuery): void
  load(append?: boolean): Promise<void>
}

export const useLibrary = create<LibState>((set, get) => ({
  view: 'home',
  query: { limit: 60, offset: 0 },
  items: [],
  total: 0,
  smartName: '',
  setView: (v) =>
    set((s) => ({
      view: v,
      // smart 视图复用已保存的查询，不重置 category
      query:
        v === 'smart'
          ? s.query
          : { ...s.query, category: v === 'home' || v === 'all' || v === 'settings' ? undefined : v, offset: 0 }
    })),
  openSmart: (name, query) => set({ view: 'smart', smartName: name, query: { ...query, offset: 0 } }),
  setQuery: (patch) => set((s) => ({ query: { ...s.query, ...patch } })),
  load: async (append = false) => {
    const r = await am().assets.list(get().query)
    set((s) => ({
      items: append ? [...s.items, ...r.items] : r.items,
      total: r.total
    }))
  }
}))
