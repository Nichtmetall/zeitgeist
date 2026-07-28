/**
 * CSV-Im- und -Export.
 *
 * Das Format ist bewusst verlustfrei: Ein Export kann ohne Informationsverlust
 * wieder importiert werden. Die Spalte `Typ` unterscheidet Arbeitszeiten von
 * Projektbuchungen, sodass beide Datensätze in einer Datei stehen können.
 */

import { BOOKING_COLOR_KEYS } from './defaults'
import { createId } from './id'
import {
  combineDateAndTime,
  formatDecimalHours,
  formatTime,
  minutesBetween,
  parseIso,
  toDateKey,
  toLocalIso
} from './time'
import type {
  Booking,
  BookingColor,
  BreakInterval,
  Settings,
  WorkEntry,
  WorkKind
} from './types'

export const WORK_ENTRY_TYPE = 'Arbeitszeit'
export const BOOKING_TYPE = 'Zeitbuchung'

export const CSV_HEADER = [
  'Typ',
  'Datum',
  'Beginn',
  'Ende',
  'Pausen',
  'Pausenminuten',
  'Nettominuten',
  'Nettostunden',
  'Art',
  'Projekt',
  'Beschreibung',
  'Abrechenbar',
  'Farbe',
  'Notiz'
] as const

/* --------------------------------- Ausgabe -------------------------------- */

function escapeValue(value: string, delimiter: string): string {
  if (value === '') return ''
  const needsQuotes =
    value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value
}

export function rowsToCsv(rows: string[][], delimiter = ';'): string {
  return rows.map((row) => row.map((cell) => escapeValue(cell ?? '', delimiter)).join(delimiter)).join('\r\n')
}

function serializeBreaks(breaks: BreakInterval[]): string {
  return breaks
    .filter((pause) => pause.end)
    .map((pause) => `${formatTime(pause.start)}-${formatTime(pause.end as string)}`)
    .join('|')
}

function breakMinutesOf(entry: WorkEntry): number {
  return entry.breaks.reduce(
    (total, pause) => (pause.end ? total + minutesBetween(pause.start, pause.end) : total),
    0
  )
}

export function workEntryToRow(entry: WorkEntry, settings: Settings): string[] {
  const breakMinutes = breakMinutesOf(entry)
  const netMinutes = entry.end
    ? Math.max(0, minutesBetween(entry.start, entry.end) - breakMinutes)
    : 0
  return [
    WORK_ENTRY_TYPE,
    entry.date,
    formatTime(entry.start),
    entry.end ? formatTime(entry.end) : '',
    serializeBreaks(entry.breaks),
    String(Math.round(breakMinutes)),
    String(Math.round(netMinutes)),
    formatDecimalHours(netMinutes, settings.csvDecimalSeparator),
    entry.kind,
    '',
    '',
    '',
    '',
    entry.note ?? ''
  ]
}

export function bookingToRow(booking: Booking, settings: Settings): string[] {
  const minutes = minutesBetween(booking.start, booking.end)
  return [
    BOOKING_TYPE,
    booking.date,
    formatTime(booking.start),
    formatTime(booking.end),
    '',
    '',
    String(Math.round(minutes)),
    formatDecimalHours(minutes, settings.csvDecimalSeparator),
    '',
    booking.project,
    booking.description,
    booking.billable ? 'ja' : 'nein',
    booking.color,
    ''
  ]
}

export function buildCsv(
  workEntries: WorkEntry[],
  bookings: Booking[],
  settings: Settings
): string {
  const rows: string[][] = [[...CSV_HEADER]]
  for (const entry of workEntries) rows.push(workEntryToRow(entry, settings))
  for (const booking of bookings) rows.push(bookingToRow(booking, settings))
  return rowsToCsv(rows, settings.csvDelimiter)
}

/* --------------------------------- Einlesen ------------------------------- */

/** Minimaler RFC-4180-Parser inklusive Anführungszeichen und Zeilenumbrüchen. */
export function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''))
}

/** Errät das Trennzeichen anhand der Kopfzeile. */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? ''
  const candidates = [';', ',', '\t']
  let best = ';'
  let bestCount = -1
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

export interface CsvImportResult {
  workEntries: WorkEntry[]
  bookings: Booking[]
  errors: string[]
  /** Anzahl übersprungener Zeilen. */
  skipped: number
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')
}

const WORK_KINDS: WorkKind[] = ['office', 'homeoffice', 'travel', 'other']

function parseDateCell(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed)
  if (german) {
    const [, day, month, year] = german
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return null
}

function parseBreakCell(cell: string, dateKey: string): BreakInterval[] {
  if (!cell.trim()) return []
  const result: BreakInterval[] = []
  for (const part of cell.split('|')) {
    const [from, to] = part.split('-').map((value) => value.trim())
    if (!from || !to) continue
    const start = combineDateAndTime(dateKey, from)
    let end = combineDateAndTime(dateKey, to)
    if (!start || !end) continue
    if (end.getTime() < start.getTime()) end = new Date(end.getTime() + 24 * 3600 * 1000)
    result.push({ id: createId(), start: toLocalIso(start), end: toLocalIso(end) })
  }
  return result
}

/**
 * Liest eine CSV-Datei ein. Unbekannte Zeilen werden übersprungen und im
 * Ergebnis gemeldet, statt den gesamten Import scheitern zu lassen.
 */
export function parseImportCsv(text: string, delimiter?: string): CsvImportResult {
  const usedDelimiter = delimiter ?? detectDelimiter(text)
  const rows = parseCsvText(text, usedDelimiter)
  const result: CsvImportResult = { workEntries: [], bookings: [], errors: [], skipped: 0 }
  if (rows.length === 0) {
    result.errors.push('Die Datei enthält keine Daten.')
    return result
  }

  const header = rows[0].map(normalizeHeader)
  const columnOf = (...names: string[]): number => {
    for (const name of names) {
      const index = header.indexOf(normalizeHeader(name))
      if (index >= 0) return index
    }
    return -1
  }

  const typeIndex = columnOf('Typ', 'Type')
  const dateIndex = columnOf('Datum', 'Date')
  const startIndex = columnOf('Beginn', 'Start', 'Von')
  const endIndex = columnOf('Ende', 'End', 'Bis')
  const breaksIndex = columnOf('Pausen', 'Breaks')
  const kindIndex = columnOf('Art', 'Kind')
  const projectIndex = columnOf('Projekt', 'Project')
  const descriptionIndex = columnOf('Beschreibung', 'Aufgabe', 'Description')
  const billableIndex = columnOf('Abrechenbar', 'Billable')
  const colorIndex = columnOf('Farbe', 'Color')
  const noteIndex = columnOf('Notiz', 'Note', 'Bemerkung')

  if (dateIndex < 0 || startIndex < 0) {
    result.errors.push(
      'Die Kopfzeile muss mindestens die Spalten "Datum" und "Beginn" enthalten.'
    )
    return result
  }

  const timestamp = toLocalIso(new Date())

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const cell = (index: number): string => (index >= 0 ? (row[index] ?? '').trim() : '')
    const lineNumber = rowIndex + 1

    const dateKey = parseDateCell(cell(dateIndex))
    if (!dateKey) {
      result.errors.push(`Zeile ${lineNumber}: Datum "${cell(dateIndex)}" konnte nicht gelesen werden.`)
      result.skipped += 1
      continue
    }

    const startDate = combineDateAndTime(dateKey, cell(startIndex))
    if (!startDate) {
      result.errors.push(`Zeile ${lineNumber}: Beginn "${cell(startIndex)}" ist keine gültige Uhrzeit.`)
      result.skipped += 1
      continue
    }

    let endDate = cell(endIndex) ? combineDateAndTime(dateKey, cell(endIndex)) : null
    if (endDate && endDate.getTime() < startDate.getTime()) {
      endDate = new Date(endDate.getTime() + 24 * 3600 * 1000)
    }

    const rawType = normalizeHeader(cell(typeIndex))
    const isBooking =
      rawType === normalizeHeader(BOOKING_TYPE) ||
      rawType === 'booking' ||
      (typeIndex < 0 && (cell(projectIndex) !== '' || cell(descriptionIndex) !== ''))

    if (isBooking) {
      if (!endDate) {
        result.errors.push(`Zeile ${lineNumber}: Zeitbuchungen benötigen ein Ende.`)
        result.skipped += 1
        continue
      }
      const color = cell(colorIndex) as BookingColor
      result.bookings.push({
        id: createId(),
        date: dateKey,
        start: toLocalIso(startDate),
        end: toLocalIso(endDate),
        project: cell(projectIndex),
        description: cell(descriptionIndex),
        color: BOOKING_COLOR_KEYS.includes(color) ? color : 'brand',
        billable: /^(ja|yes|true|1|x)$/i.test(cell(billableIndex)),
        createdAt: timestamp,
        updatedAt: timestamp
      })
      continue
    }

    const kindCell = cell(kindIndex).toLowerCase()
    const kind = (WORK_KINDS as string[]).includes(kindCell) ? (kindCell as WorkKind) : 'office'

    result.workEntries.push({
      id: createId(),
      date: dateKey,
      start: toLocalIso(startDate),
      end: endDate ? toLocalIso(endDate) : null,
      breaks: parseBreakCell(cell(breaksIndex), dateKey),
      kind,
      note: cell(noteIndex) || undefined,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  return result
}

/** Entfernt Duplikate gegenüber bereits vorhandenen Datensätzen. */
export function dedupeImport(
  imported: CsvImportResult,
  existing: { workEntries: WorkEntry[]; bookings: Booking[] }
): { workEntries: WorkEntry[]; bookings: Booking[]; duplicates: number } {
  const workKeys = new Set(
    existing.workEntries.map((entry) => `${entry.date}|${entry.start}|${entry.end ?? ''}`)
  )
  const bookingKeys = new Set(
    existing.bookings.map(
      (booking) => `${booking.date}|${booking.start}|${booking.end}|${booking.project}`
    )
  )

  let duplicates = 0
  const workEntries = imported.workEntries.filter((entry) => {
    const key = `${entry.date}|${entry.start}|${entry.end ?? ''}`
    if (workKeys.has(key)) {
      duplicates += 1
      return false
    }
    workKeys.add(key)
    return true
  })
  const bookings = imported.bookings.filter((booking) => {
    const key = `${booking.date}|${booking.start}|${booking.end}|${booking.project}`
    if (bookingKeys.has(key)) {
      duplicates += 1
      return false
    }
    bookingKeys.add(key)
    return true
  })

  return { workEntries, bookings, duplicates }
}

/** Hilfsfunktion für Berichte: Datumsschlüssel eines Zeitstempels. */
export function dateKeyOf(value: string): string {
  return toDateKey(parseIso(value))
}
