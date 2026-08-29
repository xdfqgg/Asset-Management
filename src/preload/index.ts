import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 后续 Task 9 会把 window.am 的资产 API 桥接加到这里
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
