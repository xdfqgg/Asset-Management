import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import fs from 'node:fs'
import type { Database } from 'better-sqlite3'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openDb, migrate, getAsset } from './db'
import { registerIpcHandlers } from './ipc'
import { listRoots } from './scan/roots'
import { scanDirectory } from './scan/ingest'
import { startWatcher } from './scan/watcher'
import { TaskQueue } from './thumbs/queue'
import { enqueueThumbnail } from './thumbs/pipeline'
import { ensureCategoryCatalogs } from './catalogs'

let db: Database.Database
let queue: TaskQueue
let thumbsDir: string

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

/** 装配主进程各模块（数据层 → 队列 → IPC → 扫描 → 监听） */
function bootstrapLibrary(): void {
  const userData = app.getPath('userData')
  thumbsDir = join(userData, 'thumbs')
  fs.mkdirSync(thumbsDir, { recursive: true })
  db = openDb(join(userData, 'library.db'))
  migrate(db)

  queue = new TaskQueue(2)
  queue.onDone = (assetId, ok) => {
    const a = getAsset(db, assetId)
    broadcast('thumbs:event', { assetId, status: a?.thumb_status ?? (ok ? 'ready' : 'failed') })
  }

  registerIpcHandlers({
    db,
    broadcast,
    onRootAdded: (root) => {
      void ensureCategoryCatalogs(db, [root.path])
      for (const id of scanDirectory(db, root.id)) enqueueThumbnail(db, queue, id, thumbsDir)
      broadcast('assets:event', { type: 'rescan', assetId: null })
    }
  })

  // 启动：给每个根目录写 Blender 目录文件（互通）→ 全量扫描 → 缩略图入队 → 开启实时监听
  void ensureCategoryCatalogs(db, listRoots(db).map((r) => r.path))
  for (const root of listRoots(db)) {
    for (const id of scanDirectory(db, root.id)) enqueueThumbnail(db, queue, id, thumbsDir)
  }
  startWatcher(db, (type, assetId) => {
    if ((type === 'add' || type === 'change') && assetId) {
      enqueueThumbnail(db, queue, assetId, thumbsDir)
    }
    broadcast('assets:event', { type, assetId })
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'AssetManagement',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 外链交给系统浏览器打开，不在应用内跳转
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载 vite 开发服务器（热更新），生产模式加载打包好的页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xdfqgg.assetmanagement')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  bootstrapLibrary()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
