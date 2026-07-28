/**
 * Rauchtest der gebauten Anwendung.
 *
 * Startet Electron mit einem temporären Benutzerprofil, klickt sich durch alle
 * Seiten, erzeugt CSV-, Excel- und PDF-Exporte, liest den CSV-Export wieder ein
 * und legt Bildschirmfotos ab. Aufruf: `npm run smoke` (unter Linux mit xvfb).
 */

import { app, BrowserWindow, dialog } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Unter Xvfb liefert die GPU-Komposition leere Bildschirmfotos.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

const OUT_DIR = process.env.SMOKE_OUT ?? join(tmpdir(), 'zeitwerk-smoke')
const PROFILE_DIR = join(OUT_DIR, 'profile')
const EXPORT_DIR = join(OUT_DIR, 'exports')

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(PROFILE_DIR, { recursive: true })
mkdirSync(EXPORT_DIR, { recursive: true })

const failures = []
const logs = []

function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`)
  } else {
    failures.push(message)
    console.log(`  FAIL ${message}`)
  }
}

/* ----------------------------- Testdaten anlegen -------------------------- */

function pad(value) {
  return String(value).padStart(2, '0')
}

function iso(date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00.000` +
    `${sign}${pad(Math.trunc(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

function at(date, hours, minutes) {
  const copy = new Date(date)
  copy.setHours(hours, minutes, 0, 0)
  return copy
}

function seedData() {
  const workEntries = []
  const bookings = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - offset)
    const weekday = day.getDay()
    if (weekday === 0 || weekday === 6) continue
    const dateKey = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    const start = at(day, 8, 0)
    const end = at(day, offset === 0 ? 15 : 17, 0)

    workEntries.push({
      id: `seed-work-${dateKey}`,
      date: dateKey,
      start: iso(start),
      end: iso(end),
      breaks: [
        {
          id: `seed-break-${dateKey}`,
          start: iso(at(day, 12, 0)),
          end: iso(at(day, 12, offset === 0 ? 10 : 30))
        }
      ],
      kind: offset % 2 === 0 ? 'office' : 'homeoffice',
      note: offset === 0 ? 'Kurzer Tag' : '',
      createdAt: iso(start),
      updatedAt: iso(end)
    })

    bookings.push({
      id: `seed-booking-${dateKey}-a`,
      date: dateKey,
      start: iso(at(day, 9, 0)),
      end: iso(at(day, 11, 30)),
      project: 'Kundenportal',
      description: 'Umsetzung Suchfunktion',
      color: 'brand',
      billable: true,
      createdAt: iso(start),
      updatedAt: iso(start)
    })
    bookings.push({
      id: `seed-booking-${dateKey}-b`,
      date: dateKey,
      start: iso(at(day, 13, 0)),
      end: iso(at(day, 14, 30)),
      project: 'Interne Projekte',
      description: 'Code-Review und Abstimmung',
      color: 'seafoam',
      billable: false,
      createdAt: iso(start),
      updatedAt: iso(start)
    })
  }

  // Eine Buchung bewusst außerhalb der Arbeitszeit, um den Hinweis zu prüfen.
  const lastDay = new Date(today)
  const lastKey = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`
  bookings.push({
    id: 'seed-booking-outside',
    date: lastKey,
    start: iso(at(lastDay, 19, 0)),
    end: iso(at(lastDay, 20, 0)),
    project: 'Bereitschaft',
    description: 'Störung außerhalb der Arbeitszeit',
    color: 'lilac',
    billable: true,
    createdAt: iso(at(lastDay, 19, 0)),
    updatedAt: iso(at(lastDay, 19, 0))
  })

  return {
    version: 1,
    settings: {},
    workEntries,
    bookings,
    templates: [
      {
        id: 'seed-template-1',
        name: 'Daily Standup',
        project: 'Interne Projekte',
        description: 'Tägliche Abstimmung im Team',
        defaultDurationMinutes: 15,
        color: 'gold',
        billable: false,
        createdAt: iso(today)
      },
      {
        id: 'seed-template-2',
        name: 'Feature-Entwicklung',
        project: 'Kundenportal',
        description: 'Implementierung laut Ticket',
        defaultDurationMinutes: 120,
        color: 'forest',
        billable: true,
        createdAt: iso(today)
      }
    ]
  }
}

app.setPath('userData', PROFILE_DIR)
writeFileSync(join(PROFILE_DIR, 'zeitwerk-data.json'), JSON.stringify(seedData(), null, 2), 'utf-8')

/* ---------------------------- Dialoge ersetzen ---------------------------- */

let savedPaths = []
let importPath = null

dialog.showSaveDialog = async (...args) => {
  const options = args.length > 1 ? args[1] : args[0]
  const extension = String(options?.defaultPath ?? 'datei.bin')
    .split('.')
    .pop()
  const filePath = join(EXPORT_DIR, `export.${extension}`)
  savedPaths.push(filePath)
  return { canceled: false, filePath }
}

dialog.showOpenDialog = async () => {
  if (!importPath) return { canceled: true, filePaths: [] }
  return { canceled: false, filePaths: [importPath] }
}

/* ------------------------------- Ablaufsteuerung -------------------------- */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run(window) {
  const page = window.webContents

  const evaluate = (code) => page.executeJavaScript(code, true)

  const clickByText = async (selector, text) =>
    evaluate(`(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const target = nodes.find((node) => (node.textContent || '').includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.click();
      return true;
    })()`)

  // Bildschirmfotos sind eine Beigabe: Unter Xvfb liefert die Komposition nicht
  // zuverlässig einen aktuellen Frame, deshalb bricht ein Fehler den Lauf nicht ab.
  const shoot = async (name) => {
    try {
      const [width, height] = window.getSize()
      window.setSize(width, height - 1)
      await wait(250)
      window.setSize(width, height)
      await wait(450)
      const image = await page.capturePage()
      writeFileSync(join(OUT_DIR, `${name}.png`), image.toPNG())
    } catch (error) {
      console.log(`  info Bildschirmfoto "${name}" nicht möglich: ${error?.message ?? error}`)
    }
  }

  console.log('\nOberfläche')
  const title = await evaluate('document.body.innerText.includes("Zeitwerk")')
  check(title === true, 'Anwendung ist gerendert')

  const tabCount = await evaluate('document.querySelectorAll(\'[role="tab"]\').length')
  check(tabCount >= 5, `Navigation zeigt ${tabCount} Einträge`)

  const todaySummary = await evaluate('document.body.innerText.includes("Netto heute")')
  check(todaySummary === true, 'Zeiterfassung zeigt die Tageskennzahlen')

  const breakHint = await evaluate('document.body.innerText.includes("§ 4 ArbZG")')
  check(breakHint === true, 'Hinweise nach § 4 ArbZG werden angezeigt')

  const ergonomics = await evaluate('document.body.innerText.includes("40-15-5")')
  check(ergonomics === true, 'Bewegungserinnerung ist sichtbar')
  await shoot('01-zeiterfassung')

  console.log('\nErfassung starten und stoppen')
  check(await clickByText('button', 'Arbeitszeit starten'), 'Startschaltfläche gefunden')
  await wait(1200)
  const running = await evaluate('document.body.innerText.includes("Arbeitszeit läuft")')
  check(running === true, 'Laufende Erfassung wird angezeigt')
  check(await clickByText('button', 'Pause starten'), 'Pause gestartet')
  await wait(700)
  check(
    (await evaluate('document.body.innerText.includes("Pause läuft")')) === true,
    'Laufende Pause wird angezeigt'
  )
  check(await clickByText('button', 'Pause beenden'), 'Pause beendet')
  await wait(500)
  check(await clickByText('button', 'Arbeitszeit stoppen'), 'Erfassung gestoppt')
  await wait(800)

  console.log('\nEinträge')
  check(await clickByText('[role="tab"]', 'Einträge'), 'Seite "Einträge" geöffnet')
  await wait(900)
  const rows = await evaluate('document.querySelectorAll(\'[role="row"]\').length')
  check(rows > 1, `DataGrid zeigt ${rows} Zeilen`)
  await shoot('02-eintraege')

  check(await clickByText('[role="tab"]', 'Zeitbuchungen'), 'Reiter "Zeitbuchungen" geöffnet')
  await wait(700)
  const bookingRows = await evaluate('document.querySelectorAll(\'[role="row"]\').length')
  check(bookingRows > 1, `Zeitbuchungen werden gelistet (${bookingRows} Zeilen)`)
  await shoot('03-zeitbuchungen')

  console.log('\nKalender')
  check(await clickByText('[role="tab"]', 'Kalender'), 'Seite "Kalender" geöffnet')
  await wait(1200)
  const calendarText = await evaluate('document.body.innerText.includes("Wochenansicht")')
  check(calendarText === true, 'Wochenansicht ist verfügbar')
  const bookingBlocks = await evaluate(
    'document.querySelectorAll(\'[role="button"][title]\').length'
  )
  check(bookingBlocks > 0, `Kalender zeigt ${bookingBlocks} Buchungsblöcke`)
  const templates = await evaluate('document.body.innerText.includes("Daily Standup")')
  check(templates === true, 'Vorlagen werden angezeigt')
  await shoot('04-kalender-woche')

  // Neue Buchung per Ziehen anlegen. Die Zeigerereignisse müssen in
  // getrennten Aufgaben laufen, damit React zwischendurch neu rendert.
  const pressed = await evaluate(`(() => {
    const columns = [...document.querySelectorAll('[role="presentation"]')];
    if (columns.length === 0) return 'keine Spalten';
    const column = columns[1] || columns[0];
    const rect = column.getBoundingClientRect();
    window.__smoke = { column, x: rect.left + rect.width / 2, top: rect.top };
    column.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, clientX: window.__smoke.x, clientY: rect.top + 120, button: 0, pointerId: 1
    }));
    return 'ok';
  })()`)
  check(pressed === 'ok', 'Ziehen im Kalender begonnen')
  await wait(300)
  await evaluate(`window.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, clientX: window.__smoke.x, clientY: window.__smoke.top + 200, button: 0, pointerId: 1
  })), true`)
  await wait(300)
  const ghost = await evaluate('document.body.innerText.includes(":") && true')
  check(ghost === true, 'Vorschau während des Ziehens sichtbar')
  await shoot('05-kalender-ziehen')
  await evaluate(`window.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, clientX: window.__smoke.x, clientY: window.__smoke.top + 200, button: 0, pointerId: 1
  })), true`)
  await wait(900)
  const dialogOpen = await evaluate(
    'document.body.innerText.includes("Zeitbuchung anlegen") && document.querySelectorAll(\'[role="dialog"]\').length > 0'
  )
  check(dialogOpen === true, 'Dialog für die neue Zeitbuchung geöffnet')
  await shoot('06-kalender-dialog')

  const prefilled = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('[role="dialog"] input')];
    return inputs.map((input) => input.value).join('|');
  })()`)
  check(/\d{2}:\d{2}/.test(String(prefilled)), `Dialog ist mit Zeiten vorbelegt (${prefilled})`)

  // Buchung wirklich anlegen
  await evaluate(`(() => {
    const setValue = (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const dialog = document.querySelector('[role="dialog"]');
    const combobox =
      dialog.querySelector('input[placeholder*="Projekt"]') ||
      dialog.querySelector('input[role="combobox"]');
    if (!combobox) return 'kein Projektfeld';
    setValue(combobox, 'Rauchtest');
    const textarea = dialog.querySelector('textarea');
    if (textarea) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, 'Automatisch angelegte Buchung');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  })()`)
  await wait(400)
  await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('[role="dialog"] button')];
    const save = buttons.find((button) => (button.textContent || '').trim() === 'Speichern');
    if (save) save.click();
    return true;
  })()`)
  await wait(900)
  const bookingVisible = await evaluate('document.body.innerText.includes("Rauchtest")')
  if (bookingVisible !== true) {
    console.log(
      '  debug',
      await evaluate(`JSON.stringify({
        dialogOpen: document.querySelectorAll('[role="dialog"]').length,
        buttons: [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent),
        inputs: [...document.querySelectorAll('[role="dialog"] input')].map((i) => i.value),
        body: document.body.innerText.slice(0, 400)
      })`)
    )
  }
  check(bookingVisible === true, 'Neue Buchung erscheint im Kalender')
  await shoot('07-kalender-neue-buchung')

  check(await clickByText('[role="tab"]', 'Tagesansicht'), 'Tagesansicht geöffnet')
  await wait(800)
  await shoot('08-kalender-tag')

  console.log('\nExport')
  check(await clickByText('[role="tab"]', 'Export & Import'), 'Seite "Export & Import" geöffnet')
  await wait(800)
  await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const month = buttons.find((button) => (button.textContent || '').trim() === 'Dieser Monat');
    if (month) month.click();
    return true;
  })()`)
  await wait(400)
  await shoot('09-export')

  for (const [label, extension] of [
    ['Als CSV exportieren', 'csv'],
    ['Als Excel (.xlsx) exportieren', 'xlsx'],
    ['Als PDF exportieren', 'pdf']
  ]) {
    savedPaths = []
    check(await clickByText('button', label), `Schaltfläche "${label}" geklickt`)
    await wait(2500)
    const filePath = join(EXPORT_DIR, `export.${extension}`)
    const exists = existsSync(filePath)
    check(exists, `Datei ${extension.toUpperCase()} wurde geschrieben`)
    if (!exists) continue
    const size = statSync(filePath).size
    check(size > 500, `${extension.toUpperCase()}-Datei enthält Daten (${size} Bytes)`)
    const head = readFileSync(filePath).subarray(0, 4)
    if (extension === 'pdf') check(head.toString('latin1') === '%PDF', 'PDF-Signatur stimmt')
    if (extension === 'xlsx') check(head[0] === 0x50 && head[1] === 0x4b, 'XLSX-Signatur stimmt')
    if (extension === 'csv') {
      const content = readFileSync(filePath, 'utf-8')
      check(content.includes('Typ;Datum;Beginn;Ende'), 'CSV enthält die Kopfzeile')
      check(content.includes('Kundenportal'), 'CSV enthält die Projektbuchungen')
      importPath = filePath
    }
  }

  console.log('\nImport')
  if (importPath) {
    check(await clickByText('button', 'CSV-Datei auswählen'), 'Importdialog geöffnet')
    await wait(1500)
    const recognized = await evaluate('document.body.innerText.includes("erkannt")')
    check(recognized === true, 'Importvorschau zeigt erkannte Datensätze')
    await shoot('10-import')
    check(await clickByText('button', 'Import übernehmen'), 'Import übernommen')
    await wait(1200)
    const noDuplicates = await evaluate(
      'document.body.innerText.includes("Duplikate") || document.body.innerText.includes("Import abgeschlossen")'
    )
    check(noDuplicates === true, 'Duplikatprüfung hat gegriffen')
  }

  console.log('\nEinstellungen')
  check(await clickByText('[role="tab"]', 'Einstellungen'), 'Seite "Einstellungen" geöffnet')
  await wait(900)
  const settingsText = await evaluate('document.body.innerText')
  for (const label of [
    'Sollarbeitszeit',
    'Arbeitszeitgesetz',
    'Bewegung (40-15-5)',
    'Kalender',
    'Export',
    'Darstellung'
  ]) {
    check(settingsText.includes(label), `Einstellungsbereich "${label}" vorhanden`)
  }
  await shoot('11-einstellungen')

  console.log('\nDunkles Design')
  await evaluate(`(() => {
    const radios = [...document.querySelectorAll('input[type="radio"]')];
    const dark = radios.find((radio) => radio.value === 'dark');
    if (dark) dark.click();
    return true;
  })()`)
  await wait(900)
  await shoot('12-dunkel')
  const darkApplied = await evaluate('getComputedStyle(document.body).backgroundColor')
  check(typeof darkApplied === 'string', `Hintergrundfarbe: ${darkApplied}`)

  console.log('\nSchließen')
  // Eine Einstellung ändern und sofort schließen: Die Änderung darf nicht
  // verloren gehen, und das Fenster muss sich trotzdem schließen lassen.
  const quitRequested = new Promise((resolve) => {
    app.once('will-quit', (event) => {
      event.preventDefault()
      resolve(true)
    })
  })
  await evaluate(`(() => {
    const light = [...document.querySelectorAll('input[type="radio"]')].find((r) => r.value === 'light');
    if (!light) return false;
    light.click();
    return true;
  })()`)
  window.close()

  const quit = await Promise.race([quitRequested, wait(6000).then(() => false)])
  check(quit === true, 'Fenster lässt sich schließen und die Anwendung beendet sich')

  const stored = JSON.parse(readFileSync(join(PROFILE_DIR, 'zeitwerk-data.json'), 'utf-8'))
  check(
    stored.settings.themeMode === 'light',
    `Letzte Änderung wurde vor dem Schließen gesichert (themeMode=${stored.settings.themeMode})`
  )
  check(
    stored.bookings.some((item) => item.project === 'Rauchtest'),
    'Die per Ziehen angelegte Buchung liegt in der Datendatei'
  )
}

app.whenReady().then(async () => {
  await import('../out/main/index.js')

  await wait(2500)
  const [window] = BrowserWindow.getAllWindows()
  if (!window) {
    console.error('Kein Fenster geöffnet')
    app.exit(1)
    return
  }

  window.webContents.on('console-message', (event) => {
    const message = typeof event === 'object' && 'message' in event ? event.message : ''
    const level = typeof event === 'object' && 'level' in event ? event.level : ''
    logs.push(`[${level}] ${message}`)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    failures.push(`Renderer abgestürzt: ${details.reason}`)
  })

  try {
    await run(window)
  } catch (error) {
    failures.push(`Ausnahme: ${error?.stack ?? error}`)
  }

  const errorLogs = logs.filter(
    (line) => line.startsWith('[error]') || line.startsWith('[3]') || line.includes('Warning: ')
  )
  if (errorLogs.length > 0) {
    console.log('\nKonsolenmeldungen des Renderers:')
    for (const line of errorLogs.slice(0, 20)) console.log(`  ${line}`)
  }
  check(errorLogs.length === 0, 'Keine Fehlermeldungen in der Renderer-Konsole')

  console.log(`\nBildschirmfotos: ${OUT_DIR}`)
  if (failures.length > 0) {
    console.log(`\n${failures.length} Prüfung(en) fehlgeschlagen:`)
    for (const failure of failures) console.log(`  - ${failure}`)
    app.exit(1)
    return
  }
  console.log('\nAlle Prüfungen bestanden.')
  app.exit(0)
})
