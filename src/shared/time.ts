/**
 * Zeit- und Datumshilfsfunktionen.
 *
 * Zeitstempel werden als ISO-8601 mit explizitem lokalem Zeitzonenoffset
 * gespeichert, damit gespeicherte Werte auch nach Zeitumstellungen eindeutig
 * bleiben. Kalendertage werden als `YYYY-MM-DD` geführt.
 */

const MS_PER_MINUTE = 60_000

function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, '0')
}

/** Wandelt ein `Date` in einen ISO-String mit lokalem Zeitzonenoffset. */
export function toLocalIso(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${offset}`
  )
}

export function parseIso(value: string): Date {
  return new Date(value)
}

/** Kalendertag eines Zeitpunkts im Format `YYYY-MM-DD`. */
export function toDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? parseIso(value) : value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Lokale Mitternacht des angegebenen Kalendertags. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0)
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now)
}

export function startOfDay(value: Date | string): Date {
  const date = typeof value === 'string' ? parseIso(value) : value
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function endOfDay(value: Date | string): Date {
  const date = typeof value === 'string' ? parseIso(value) : value
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function addDays(value: Date | string, days: number): Date {
  const date = typeof value === 'string' ? parseIso(value) : new Date(value)
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function addMinutes(value: Date | string, minutes: number): Date {
  const date = typeof value === 'string' ? parseIso(value) : value
  return new Date(date.getTime() + minutes * MS_PER_MINUTE)
}

/** Differenz in Minuten (b − a), auf ganze Minuten gerundet. */
export function minutesBetween(a: Date | string, b: Date | string): number {
  const start = typeof a === 'string' ? parseIso(a) : a
  const end = typeof b === 'string' ? parseIso(b) : b
  return Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE)
}

/** Wochentag nach ISO-8601 (1 = Montag … 7 = Sonntag). */
export function isoWeekday(value: Date | string): number {
  const date = typeof value === 'string' ? parseIso(value) : value
  return date.getDay() === 0 ? 7 : date.getDay()
}

/** Beginn der Woche, die den angegebenen Tag enthält. */
export function startOfWeek(value: Date | string, weekStartsOn = 1): Date {
  const date = startOfDay(value)
  const current = isoWeekday(date)
  const diff = (current - weekStartsOn + 7) % 7
  return addDays(date, -diff)
}

/** Kalenderwoche nach ISO-8601. */
export function isoWeekNumber(value: Date | string): number {
  const date = startOfDay(value)
  const target = new Date(date.getTime())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

/** Minuten seit Mitternacht des jeweiligen Tages. */
export function minutesSinceMidnight(value: Date | string): number {
  const date = typeof value === 'string' ? parseIso(value) : value
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
}

/** Wandelt `HH:mm` in Minuten seit Mitternacht. Ungültige Werte ergeben `null`. */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Formatiert Minuten seit Mitternacht als `HH:mm`. */
export function minutesToHhMm(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`
}

/** Kombiniert Kalendertag und Uhrzeit (`HH:mm`) zu einem `Date`. */
export function combineDateAndTime(dateKey: string, time: string): Date | null {
  const minutes = parseHhMm(time)
  if (minutes === null) return null
  const base = fromDateKey(dateKey)
  base.setMinutes(minutes)
  return base
}

/** Uhrzeit eines Zeitstempels als `HH:mm`. */
export function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? parseIso(value) : value
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Datum als `TT.MM.JJJJ`. */
export function formatDate(value: Date | string): string {
  const date = typeof value === 'string' && value.length === 10 ? fromDateKey(value) : value
  const parsed = typeof date === 'string' ? parseIso(date) : date
  return `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}.${parsed.getFullYear()}`
}

const LONG_DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
})

const MEDIUM_DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit'
})

export function formatDateLong(value: Date | string): string {
  const date =
    typeof value === 'string' ? (value.length === 10 ? fromDateKey(value) : parseIso(value)) : value
  return LONG_DATE.format(date)
}

export function formatDateMedium(value: Date | string): string {
  const date =
    typeof value === 'string' ? (value.length === 10 ? fromDateKey(value) : parseIso(value)) : value
  return MEDIUM_DATE.format(date)
}

/**
 * Dauer in Minuten als `8:05 h`. Negative Werte behalten ihr Vorzeichen.
 *
 * Bewusst mit dem ASCII-Minus statt dem typografischen Minuszeichen: Die
 * Standardschriften im PDF-Export decken U+2212 nicht ab.
 */
export function formatDuration(minutes: number, withUnit = true): string {
  const rounded = Math.round(minutes)
  const sign = rounded < 0 ? '-' : ''
  const abs = Math.abs(rounded)
  const text = `${sign}${Math.floor(abs / 60)}:${pad(abs % 60)}`
  return withUnit ? `${text} h` : text
}

/** Dauer in Minuten als Dezimalstunden, z. B. `8,25`. */
export function formatDecimalHours(minutes: number, decimalSeparator = ','): string {
  const value = (Math.round((minutes / 60) * 100) / 100).toFixed(2)
  return decimalSeparator === ',' ? value.replace('.', ',') : value
}

/** Saldo mit führendem Vorzeichen, z. B. `+0:30 h`. */
export function formatBalance(minutes: number): string {
  if (Math.round(minutes) === 0) return '±0:00 h'
  const prefix = minutes > 0 ? '+' : ''
  return `${prefix}${formatDuration(minutes)}`
}

/** Rundet Minuten auf ein Vielfaches von `step` (0 = keine Rundung). */
export function roundMinutes(minutes: number, step: number): number {
  if (!step || step <= 0) return Math.round(minutes)
  return Math.round(minutes / step) * step
}

/** Überlappung zweier Intervalle in Minuten. */
export function overlapMinutes(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string
): number {
  const s1 = (typeof aStart === 'string' ? parseIso(aStart) : aStart).getTime()
  const e1 = (typeof aEnd === 'string' ? parseIso(aEnd) : aEnd).getTime()
  const s2 = (typeof bStart === 'string' ? parseIso(bStart) : bStart).getTime()
  const e2 = (typeof bEnd === 'string' ? parseIso(bEnd) : bEnd).getTime()
  return Math.max(0, Math.min(e1, e2) - Math.max(s1, s2)) / MS_PER_MINUTE
}

/** Liste aller Kalendertage zwischen zwei Tagen (jeweils inklusive). */
export function dateKeyRange(from: string, to: string): string[] {
  const keys: string[] = []
  let cursor = fromDateKey(from)
  const last = fromDateKey(to)
  let guard = 0
  while (cursor.getTime() <= last.getTime() && guard < 4000) {
    keys.push(toDateKey(cursor))
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return keys
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Formatiert Sekunden als `mm:ss`, z. B. für Countdown-Anzeigen. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`
}
