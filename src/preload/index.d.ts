import { ElectronAPI } from '@electron-toolkit/preload'
import type { AssetRow, AssetQuery, AssetPatch, Root, SmartFolder, Tag } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    am: {
      roots: {
        list(): Promise<Root[]>
        add(path: string): Promise<Root[]>
        remove(id: string): Promise<Root[]>
      }
      assets: {
        list(q: AssetQuery): Promise<{ items: AssetRow[]; total: number }>
        get(id: string): Promise<AssetRow | null>
        tags(id: string): Promise<Tag[]>
        update(id: string, patch: AssetPatch): Promise<AssetRow | null>
      }
      tags: {
        list(type?: 'normal' | 'series'): Promise<Tag[]>
      }
      smart: {
        list(): Promise<SmartFolder[]>
        add(name: string, query: AssetQuery): Promise<SmartFolder>
        remove(id: string): Promise<SmartFolder[]>
      }
      blender: {
        health(): Promise<boolean>
        import(id: string, mode: 'link' | 'append'): Promise<void>
      }
      startDrag(id: string): Promise<void>
      startDragSet(id: string): Promise<void>
      settings: {
        get(key: string): Promise<string | null>
        set(key: string, value: string): Promise<void>
      }
      onAssetsEvent(cb: (e: { type: string; assetId: string | null }) => void): () => void
      onThumbsEvent(cb: (e: { assetId: string; status: string }) => void): () => void
    }
  }
}
