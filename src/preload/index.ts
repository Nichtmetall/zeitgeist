import { contextBridge, ipcRenderer } from 'electron'
import type { ReportModel } from '../shared/report'
import type {
  AppData,
  ExportResult,
  ImportResult,
  NotificationRequest
} from '../shared/types'

/** Die einzige Brücke zwischen Renderer und Betriebssystem. */
const api = {
  loadData: (): Promise<AppData> => ipcRenderer.invoke('data:load'),
  saveData: (data: AppData): Promise<AppData> => ipcRenderer.invoke('data:save', data),
  dataPath: (): Promise<string> => ipcRenderer.invoke('data:path'),
  revealDataFile: (): Promise<void> => ipcRenderer.invoke('data:reveal'),

  saveText: (request: {
    defaultName: string
    content: string
    filterName: string
    extension: string
  }): Promise<ExportResult> => ipcRenderer.invoke('file:saveText', request),

  saveBinary: (request: {
    defaultName: string
    data: Uint8Array
    filterName: string
    extension: string
  }): Promise<ExportResult> => ipcRenderer.invoke('file:saveBinary', request),

  saveXlsx: (request: { defaultName: string; report: ReportModel }): Promise<ExportResult> =>
    ipcRenderer.invoke('file:saveXlsx', request),

  openCsv: (): Promise<ImportResult> => ipcRenderer.invoke('file:openCsv'),

  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:showItem', filePath),
  openPath: (filePath: string): Promise<string> => ipcRenderer.invoke('shell:openPath', filePath),

  notify: (request: NotificationRequest): Promise<void> => ipcRenderer.invoke('app:notify', request),
  flashFrame: (flash: boolean): Promise<void> => ipcRenderer.invoke('app:flashFrame', flash),

  onNavigate: (handler: (page: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, page: string): void => handler(page)
    ipcRenderer.on('menu:navigate', listener)
    return () => ipcRenderer.removeListener('menu:navigate', listener)
  },

  onCommand: (handler: (command: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string): void => handler(command)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },

  platform: process.platform
}

export type ZeitwerkApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('zeitwerk', api)
} else {
  // Fallback für den unwahrscheinlichen Fall deaktivierter Kontextisolation.
  ;(globalThis as unknown as Record<string, unknown>).zeitwerk = api
}
