import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openDb, migrate, getAsset, getSetting, setSetting } from './db'
import type { Db } from './db'
import { backupDatabase, restoreLatestBackup } from './db/backup'
import { registerIpcHandlers } from './ipc'
import { listRoots } from './scan/roots'
import { scanDirectory } from './scan/ingest'
import { startWatcher, addRootToWatcher, whenWatcherReady } from './scan/watcher'
import { registerThumbProtocol } from './thumbs/thumbProtocol'
import { flushSeriesTags } from './meta/seriesTags'
import { TaskQueue } from './thumbs/queue'
import { enqueueThumbnail } from './thumbs/pipeline'
import { ensureCategoryCatalogs } from './catalogs'

let db: Db
let queue: TaskQueue
let thumbsDir: string

// 自定义协议必须在 app ready 之前注册特权（Electron 硬性要求）
protocol.registerSchemesAsPrivileged([
  { scheme: 'thumb', privileges: { standard: false, secure: true, supportFetchAPI: true, stream: true } }
])

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

/** 把素材根目录清单写给插件（自动上材质 B 通道：插件按名字根在清单里搜贴图） */
function writeRootsFile(): void {
  try {
    fs.writeFileSync(join(app.getPath('userData'), 'roots.txt'), JSON.stringify(listRoots(db).map((r) => r.path)))
  } catch (e) {
    console.error('[roots.txt] 写入失败', e)
  }
}

/** 打开数据库：失败时自动用最新备份恢复再重试（设计文档 §9） */
function openDbSafely(dbPath: string, backupsDir: string): Db {
  try {
    return openDb(dbPath)
  } catch {
    restoreLatestBackup(dbPath, backupsDir)
    return openDb(dbPath)
  }
}

/** 装配主进程各模块（数据层 → 队列 → IPC → 扫描 → 监听） */
function bootstrapLibrary(): void {
  const userData = app.getPath('userData')
  thumbsDir = join(userData, 'thumbs')
  const backupsDir = join(userData, 'backups')
  const dbPath = join(userData, 'library.db')
  fs.mkdirSync(thumbsDir, { recursive: true })
  registerThumbProtocol(thumbsDir)

  db = openDbSafely(dbPath, backupsDir)
  migrate(db)
  backupDatabase(dbPath, backupsDir, 3) // 每次启动自动备份

  // 插件认证 token（审查 A9）：首启生成，存 settings + 写约定文件给插件读取
  let token = getSetting(db, 'blender_token')
  if (!token) {
    token = randomBytes(32).toString('hex')
    setSetting(db, 'blender_token', token)
  }
  try {
    fs.writeFileSync(join(userData, 'blender_token.txt'), token)
  } catch {
    // token 文件写入失败只影响插件认证，不影响其他功能
  }

  const concurrency = Number(getSetting(db, 'thumbs_concurrency')) || 2
  queue = new TaskQueue(6, concurrency) // 快车道 6（图片秒过）、慢车道按设置（Blender 渲染）
  queue.onDone = (assetId, ok) => {
    const a = getAsset(db, assetId)
    broadcast('thumbs:event', { assetId, status: a?.thumb_status ?? (ok ? 'ready' : 'failed') })
  }

  registerIpcHandlers({
    db,
    broadcast,
    onRootAdded: (root) => {
      ensureCategoryCatalogs(db, [root.path]).catch((e) => console.error('[catalogs] 写入失败', e))
      addRootToWatcher(root.id, root.path) // 先挂监听再扫描：扫描期间的新文件事件与扫描结果幂等合并
      for (const id of scanDirectory(db, root.id)) enqueueThumbnail(db, queue, id, thumbsDir)
      flushSeriesTags(db) // 批量扫描结束，立即维护系列标签
      writeRootsFile() // 同步给插件（自动上材质）
      broadcast('assets:event', { type: 'rescan', assetId: null })
    },
    onRootsChanged: () => writeRootsFile(),
    onSettingsChanged: (key, value) => {
      if (key === 'thumbs_concurrency') {
        queue.setLowConcurrency(Number(value) || 2)
      }
    }
  })

  // 启动：写目录文件 → 开启监听 → 等监听就绪 → 全量扫描 → 缩略图入队
  // 顺序关键：监听必须先就绪再扫描，否则「监听基线建立期间」进入的文件会被静默漏掉
  ensureCategoryCatalogs(db, listRoots(db).map((r) => r.path)).catch((e) =>
    console.error('[catalogs] 写入失败', e)
  )
  startWatcher(db, (type, assetId) => {
    if ((type === 'add' || type === 'change') && assetId) {
      enqueueThumbnail(db, queue, assetId, thumbsDir, type === 'change') // 文件变更强制重做
    }
    broadcast('assets:event', { type, assetId })
  })
  void whenWatcherReady().then(() => {
    for (const root of listRoots(db)) {
      for (const id of scanDirectory(db, root.id)) enqueueThumbnail(db, queue, id, thumbsDir)
    }
    flushSeriesTags(db) // 全量扫描结束，立即维护系列标签（去抖期间退出也不丢）
    writeRootsFile() // 启动时同步根目录清单（自动上材质）
  })
}

// 退出前同步收尾：去抖中的系列标签维护立即落库（审查 A5）
app.on('before-quit', () => {
  if (db) flushSeriesTags(db)
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'AssetManagement',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true // 审查 A10：preload 只用 contextBridge/ipcRenderer，无 Node 需求，收紧攻击面
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
