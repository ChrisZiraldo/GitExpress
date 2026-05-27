import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { getRecents, getWindowBounds, saveWindowBounds } from './store'

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
  const bounds = getWindowBounds()
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 600,
    minHeight: 480,
    backgroundColor: '#0f1115',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  const persistBounds = (): void => {
    if (win.isDestroyed()) return
    const b = win.getBounds()
    saveWindowBounds(b)
  }
  win.on('resize', persistBounds)
  win.on('move', persistBounds)

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined)
    return { action: 'deny' }
  })

  // Suppress Electron's built-in context menu so our React context menus work.
  // In dev you can still open DevTools via View menu or Cmd+Alt+I.
  win.webContents.on('context-menu', (e) => {
    e.preventDefault()
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpc()
  buildAppMenu(getRecents())
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = process.env['ELECTRON_RENDERER_URL']
    if (allowed && url.startsWith(allowed)) return
    event.preventDefault()
  })
})
