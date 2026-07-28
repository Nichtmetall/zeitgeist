/**
 * IPC-Schnittstelle zwischen Renderer und Hauptprozess.
 *
 * Der Renderer besitzt keinerlei Node-Zugriff; sämtliche Dateioperationen
 * laufen ausschließlich über diese klar umrissenen Kanäle.
 */

import { BrowserWindow, Notification, dialog, ipcMain, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ReportModel } from '../shared/report'
import type {
  AppData,
  ExportResult,
  ImportResult,
  NotificationRequest
} from '../shared/types'
import { dataFilePath, loadData, saveData } from './store'
import { writeXlsx } from './xlsx'

interface SaveTextRequest {
  defaultName: string
  content: string
  filterName: string
  extension: string
}

interface SaveBinaryRequest {
  defaultName: string
  data: Uint8Array
  filterName: string
  extension: string
}

interface SaveXlsxRequest {
  defaultName: string
  report: ReportModel
}

async function askForPath(
  window: BrowserWindow | null,
  defaultName: string,
  filterName: string,
  extension: string
): Promise<string | null> {
  const result = window
    ? await dialog.showSaveDialog(window, {
        title: 'Export speichern',
        defaultPath: `${defaultName}.${extension}`,
        filters: [{ name: filterName, extensions: [extension] }]
      })
    : await dialog.showSaveDialog({
        title: 'Export speichern',
        defaultPath: `${defaultName}.${extension}`,
        filters: [{ name: filterName, extensions: [extension] }]
      })
  return result.canceled || !result.filePath ? null : result.filePath
}

function errorResult(error: unknown): ExportResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('data:load', async (): Promise<AppData> => loadData())

  ipcMain.handle('data:save', async (_event, data: AppData): Promise<AppData> => saveData(data))

  ipcMain.handle('data:path', (): string => dataFilePath())

  ipcMain.handle('data:reveal', async (): Promise<void> => {
    shell.showItemInFolder(dataFilePath())
  })

  ipcMain.handle(
    'file:saveText',
    async (event, request: SaveTextRequest): Promise<ExportResult> => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const filePath = await askForPath(
          window,
          request.defaultName,
          request.filterName,
          request.extension
        )
        if (!filePath) return { ok: false, canceled: true }
        const { writeFile } = await import('node:fs/promises')
        // BOM sorgt dafür, dass Excel Umlaute in CSV-Dateien korrekt anzeigt.
        const prefix = request.extension === 'csv' ? '\uFEFF' : ''
        await writeFile(filePath, prefix + request.content, 'utf-8')
        return { ok: true, filePath }
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  ipcMain.handle(
    'file:saveBinary',
    async (event, request: SaveBinaryRequest): Promise<ExportResult> => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const filePath = await askForPath(
          window,
          request.defaultName,
          request.filterName,
          request.extension
        )
        if (!filePath) return { ok: false, canceled: true }
        const { writeFile } = await import('node:fs/promises')
        await writeFile(filePath, Buffer.from(request.data))
        return { ok: true, filePath }
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  ipcMain.handle(
    'file:saveXlsx',
    async (event, request: SaveXlsxRequest): Promise<ExportResult> => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const filePath = await askForPath(
          window,
          request.defaultName,
          'Excel-Arbeitsmappe',
          'xlsx'
        )
        if (!filePath) return { ok: false, canceled: true }
        await writeXlsx(request.report, filePath)
        return { ok: true, filePath }
      } catch (error) {
        return errorResult(error)
      }
    }
  )

  ipcMain.handle('file:openCsv', async (event): Promise<ImportResult> => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'CSV-Datei importieren',
        filters: [
          { name: 'CSV-Datei', extensions: ['csv', 'txt'] },
          { name: 'Alle Dateien', extensions: ['*'] }
        ],
        properties: ['openFile']
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
      const filePath = result.filePaths[0]
      const content = await readFile(filePath, 'utf-8')
      return { ok: true, content, fileName: basename(filePath) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('shell:showItem', async (_event, filePath: string): Promise<void> => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:openPath', async (_event, filePath: string): Promise<string> =>
    shell.openPath(filePath)
  )

  ipcMain.handle('app:notify', (_event, request: NotificationRequest): void => {
    if (!Notification.isSupported()) return
    new Notification({
      title: request.title,
      body: request.body,
      silent: request.silent ?? true
    }).show()
  })

  ipcMain.handle('app:flashFrame', (event, flash: boolean): void => {
    BrowserWindow.fromWebContents(event.sender)?.flashFrame(flash)
  })
}
