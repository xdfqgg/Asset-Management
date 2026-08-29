import { ElectronAPI } from '@electron-toolkit/preload'
import type { AssetRow, AssetQuery, AssetPatch, Root, Tag } from '../shared/types'

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
      blender: {
        health(): Promise<boolean>
        import(id: string, mode: 'link' | 'append'): Promise<void>
      }
      settings: {
        get(key: string): Promise<string | null>
        set(key: string, value: string): Promise<void>
      }
      onAssetsEvent(cb: (e: { type: string; assetId: string | null }) => void): () => void
      onThumbsEvent(cb: (e: { assetId: string; status: string }) => void): () => void
    }
  }
}
