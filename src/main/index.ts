import { BrowserWindow, app, ipcMain, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { buildMenu } from './menu'
import { flushPendingWrites, loadData } from './store'

const currentDir = dirname(fileURLToPath(import.meta.url))
const isDevelopment = !app.isPackaged

// Electron's GPU compositor can leave an otherwise healthy renderer as a
// uniformly dark window on some Linux graphics stacks after the first input.
// Software rendering is more reliable for this primarily form-based desktop UI.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#292929' : '#f5f5f5',
    autoHideMenuBar: false,
    title: 'Zeitwerk',
    webPreferences: {
      preload: join(currentDir, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Vor dem Schließen dem Renderer Gelegenheit geben, eine noch nicht
  // geschriebene Änderung zu sichern.
  let readyToClose = false
  mainWindow.on('close', (event) => {
    const window = mainWindow
    if (readyToClose || !window) return
    event.preventDefault()

    const finish = (): void => {
      readyToClose = true
      void flushPendingWrites().then(() => window.close())
    }
    const timer = setTimeout(finish, 1500)
    ipcMain.once('app:flushed', () => {
      clearTimeout(timer)
      finish()
    })
    window.webContents.send('app:flush')
  })

  // Externe Links im Standardbrowser öffnen, niemals im App-Fenster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDevelopment && devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(currentDir, '../renderer/index.html'))
  }

  buildMenu(mainWindow)
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    app.setAppUserModelId('de.zeitwerk.app')
    registerIpcHandlers()
    // Datei früh laden, damit der erste Renderer-Aufruf sofort antwortet.
    await loadData()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    void flushPendingWrites()
  })
}
