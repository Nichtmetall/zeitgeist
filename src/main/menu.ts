import { Menu, app, shell, type BrowserWindow } from 'electron'
import { dataFilePath } from './store'

/** Sendet ein Navigationsereignis an den Renderer. */
function navigate(window: BrowserWindow | null, page: string): void {
  window?.webContents.send('menu:navigate', page)
}

function command(window: BrowserWindow | null, name: string): void {
  window?.webContents.send('menu:command', name)
}

export function buildMenu(window: BrowserWindow): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `Über ${app.name}` },
              { type: 'separator' },
              { role: 'hide', label: 'Ausblenden' },
              { role: 'hideOthers', label: 'Andere ausblenden' },
              { role: 'unhide', label: 'Alle einblenden' },
              { type: 'separator' },
              { role: 'quit', label: 'Beenden' }
            ]
          }
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'Datei',
      submenu: [
        {
          label: 'CSV importieren …',
          accelerator: 'CmdOrCtrl+I',
          click: () => command(window, 'import-csv')
        },
        {
          label: 'Exportieren …',
          accelerator: 'CmdOrCtrl+E',
          click: () => navigate(window, 'reports')
        },
        { type: 'separator' },
        {
          label: 'Datenordner öffnen',
          click: () => shell.showItemInFolder(dataFilePath())
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fenster schließen' } : { role: 'quit', label: 'Beenden' }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Rückgängig' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' }
      ]
    },
    {
      label: 'Erfassung',
      submenu: [
        {
          label: 'Arbeitszeit starten / stoppen',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => command(window, 'toggle-work')
        },
        {
          label: 'Pause starten / beenden',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => command(window, 'toggle-break')
        }
      ]
    },
    {
      label: 'Ansicht',
      submenu: [
        {
          label: 'Zeiterfassung',
          accelerator: 'CmdOrCtrl+1',
          click: () => navigate(window, 'tracker')
        },
        { label: 'Einträge', accelerator: 'CmdOrCtrl+2', click: () => navigate(window, 'entries') },
        {
          label: 'Kalender',
          accelerator: 'CmdOrCtrl+3',
          click: () => navigate(window, 'calendar')
        },
        { label: 'Berichte', accelerator: 'CmdOrCtrl+4', click: () => navigate(window, 'reports') },
        {
          label: 'Einstellungen',
          accelerator: 'CmdOrCtrl+,',
          click: () => navigate(window, 'settings')
        },
        { type: 'separator' },
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom zurücksetzen' },
        { role: 'zoomIn', label: 'Vergrößern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Vollbild' }
      ]
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: 'Arbeitszeitgesetz (ArbZG) öffnen',
          click: () => shell.openExternal('https://www.gesetze-im-internet.de/arbzg/')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
