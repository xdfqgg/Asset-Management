import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// preload 桥：把主进程的能力以「白名单」方式暴露给界面（window.am）。
// contextBridge 是 Electron 的安全边界——渲染进程只能拿到这里列出的函数，碰不到 Node 能力。
const api = {
  roots: {
    list: () => ipcRenderer.invoke('roots:list'),
    add: (path: string) => ipcRenderer.invoke('roots:add', path),
    remove: (id: string) => ipcRenderer.invoke('roots:remove', id)
  },
  assets: {
    list: (q: unknown) => ipcRenderer.invoke('assets:list', q),
    get: (id: string) => ipcRenderer.invoke('assets:get', id),
    tags: (id: string) => ipcRenderer.invoke('assets:tags', id),
    update: (id: string, patch: unknown) => ipcRenderer.invoke('assets:update', id, patch)
  },
  tags: {
    list: (type?: 'normal' | 'series') => ipcRenderer.invoke('tags:list', type)
  },
  blender: {
    health: () => ipcRenderer.invoke('blender:health'),
    import: (id: string, mode: 'link' | 'append') => ipcRenderer.invoke('blender:import', id, mode)
  },
  startDrag: (id: string) => ipcRenderer.invoke('assets:start-drag', id),
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  onAssetsEvent: (cb: (e: { type: string; assetId: string | null }) => void) => {
    const listener = (_e: unknown, d: { type: string; assetId: string | null }): void => cb(d)
    ipcRenderer.on('assets:event', listener)
    return () => ipcRenderer.removeListener('assets:event', listener)
  },
  onThumbsEvent: (cb: (e: { assetId: string; status: string }) => void) => {
    const listener = (_e: unknown, d: { assetId: string; status: string }): void => cb(d)
    ipcRenderer.on('thumbs:event', listener)
    return () => ipcRenderer.removeListener('thumbs:event', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('am', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.am = api
}
