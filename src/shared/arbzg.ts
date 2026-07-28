/**
 * Regelwerk auf Basis des deutschen Arbeitszeitgesetzes (ArbZG).
 *
 * Umgesetzte Vorgaben (jeweils über die Einstellungen anpassbar):
 *  - § 3  ArbZG: werktägliche Arbeitszeit höchstens 8 h, Verlängerung auf 10 h
 *                nur, wenn im Ausgleichszeitraum im Schnitt 8 h eingehalten werden.
 *  - § 4  ArbZG: Ruhepausen von mindestens 30 min bei mehr als 6 h und 45 min bei
 *                mehr als 9 h Arbeitszeit; Aufteilung in Abschnitte von mindestens
 *                15 min zulässig; nicht länger als 6 h am Stück ohne Ruhepause.
 *  - § 5  ArbZG: mindestens 11 h ununterbrochene Ruhezeit nach Arbeitsende.
 *  - § 9  ArbZG: Sonn- und Feiertagsruhe.
 *
 * Die Funktionen sind bewusst frei von Seiteneffekten, damit sie in Haupt- und
 * Renderer-Prozess sowie in Tests identisch verwendet werden können.
 */

import type {
  Booking,
  ComplianceIssue,
  DaySummary,
  Settings,
  WorkEntry
} from './types'
import {
  addDays,
  formatDuration,
  isoWeekday,
  minutesBetween,
  parseIso,
  roundMinutes,
  toDateKey,
  formatDate
} from './time'

export interface Interval {
  start: number
  end: number
}

/** Vereinigt überlappende Intervalle und sortiert sie chronologisch. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

/** Zieht die Intervalle `holes` von `base` ab. */
export function subtractIntervals(base: Interval[], holes: Interval[]): Interval[] {
  const result: Interval[] = []
  const merged = mergeIntervals(holes)
  for (const interval of base) {
    let segments: Interval[] = [{ ...interval }]
    for (const hole of merged) {
      const next: Interval[] = []
      for (const segment of segments) {
        if (hole.end <= segment.start || hole.start >= segment.end) {
          next.push(segment)
          continue
        }
        if (hole.start > segment.start) next.push({ start: segment.start, end: hole.start })
        if (hole.end < segment.end) next.push({ start: hole.end, end: segment.end })
      }
      segments = next
    }
    result.push(...segments)
  }
  return result.filter((segment) => segment.end > segment.start)
}

const MS_PER_MINUTE = 60_000

function durationMinutes(interval: Interval): number {
  return (interval.end - interval.start) / MS_PER_MINUTE
}

function sumMinutes(intervals: Interval[]): number {
  return intervals.reduce((total, interval) => total + durationMinutes(interval), 0)
}

/** Effektives Ende einer Erfassung – laufende Erfassungen enden "jetzt". */
export function effectiveEnd(value: string | null, now: Date): number {
  return value ? parseIso(value).getTime() : now.getTime()
}

/** § 4 ArbZG: gesetzlich erforderliche Pausendauer für die geleistete Arbeitszeit. */
export function requiredBreakMinutes(workMinutes: number, settings: Settings): number {
  if (workMinutes > settings.breakThreshold2Minutes) return settings.breakDuration2Minutes
  if (workMinutes > settings.breakThreshold1Minutes) return settings.breakDuration1Minutes
  return 0
}

export interface DayTimeline {
  /** Reine Arbeitsintervalle (Erfassungen abzüglich Pausen). */
  work: Interval[]
  /** Pausen: erfasste Pausen und Lücken zwischen Erfassungen. */
  pauses: Interval[]
  /** Anrechenbare Pausen (Abschnitte ≥ Mindestlänge). */
  countedPauses: Interval[]
  firstStart: number | null
  lastEnd: number | null
  running: boolean
}

/**
 * Baut die Zeitachse eines Tages aus allen Erfassungen.
 *
 * Lücken zwischen zwei Erfassungen gelten als Pause – wer die Stoppuhr für die
 * Mittagspause anhält, statt eine Pause zu erfassen, soll dieselbe Bewertung
 * erhalten.
 */
export function buildDayTimeline(
  entries: WorkEntry[],
  settings: Settings,
  now: Date = new Date()
): DayTimeline {
  const spans: Interval[] = []
  const breaks: Interval[] = []
  let running = false

  for (const entry of entries) {
    const start = parseIso(entry.start).getTime()
    const end = effectiveEnd(entry.end, now)
    if (end <= start) continue
    if (!entry.end) running = true
    spans.push({ start, end })
    for (const pause of entry.breaks) {
      const pauseStart = parseIso(pause.start).getTime()
      const pauseEnd = effectiveEnd(pause.end, now)
      if (pauseEnd <= pauseStart) continue
      breaks.push({
        start: Math.max(pauseStart, start),
        end: Math.min(pauseEnd, end)
      })
    }
  }

  const mergedSpans = mergeIntervals(spans)
  const work = subtractIntervals(mergedSpans, breaks)

  const gaps: Interval[] = []
  for (let index = 1; index < mergedSpans.length; index += 1) {
    gaps.push({ start: mergedSpans[index - 1].end, end: mergedSpans[index].start })
  }

  const pauses = mergeIntervals([...breaks, ...gaps])
  const countedPauses = pauses.filter(
    (pause) => durationMinutes(pause) >= settings.minBreakBlockMinutes
  )

  return {
    work,
    pauses,
    countedPauses,
    firstStart: mergedSpans.length ? mergedSpans[0].start : null,
    lastEnd: mergedSpans.length ? mergedSpans[mergedSpans.length - 1].end : null,
    running
  }
}

/**
 * Längste am Stück geleistete Arbeitszeit in Minuten.
 * Nur anrechenbare Pausen (≥ Mindestlänge) unterbrechen die Zählung.
 */
export function longestWorkStretchMinutes(timeline: DayTimeline): number {
  let longest = 0
  let current = 0
  let cursor: number | null = null

  for (const segment of timeline.work) {
    if (cursor !== null) {
      const gap = (segment.start - cursor) / MS_PER_MINUTE
      const interrupting = timeline.countedPauses.some(
        (pause) => pause.start < segment.start && pause.end > cursor!
      )
      if (interrupting && gap > 0) {
        longest = Math.max(longest, current)
        current = 0
      }
    }
    current += durationMinutes(segment)
    cursor = segment.end
  }
  return Math.max(longest, current)
}

/** Aktuelle ununterbrochene Arbeitsstrecke (bis jetzt) in Minuten. */
export function currentWorkStretchMinutes(timeline: DayTimeline): number {
  let current = 0
  let cursor: number | null = null
  for (const segment of timeline.work) {
    if (cursor !== null) {
      const interrupting = timeline.countedPauses.some(
        (pause) => pause.start < segment.start && pause.end > cursor!
      )
      if (interrupting) current = 0
    }
    current += durationMinutes(segment)
    cursor = segment.end
  }
  return current
}

/** Sollarbeitszeit des Tages laut Einstellungen. */
export function targetMinutesForDate(dateKey: string, settings: Settings): number {
  const weekday = isoWeekday(dateKey.length === 10 ? `${dateKey}T12:00:00` : dateKey)
  return settings.workdays.includes(weekday) ? settings.dailyTargetMinutes : 0
}

export interface DaySummaryInput {
  dateKey: string
  entries: WorkEntry[]
  bookings?: Booking[]
  settings: Settings
  now?: Date
  /** Arbeitsende des Vortags für die Ruhezeitprüfung (§ 5 ArbZG). */
  previousDayEnd?: string | null
}

/** Wertet einen einzelnen Kalendertag aus und erzeugt die zugehörigen Hinweise. */
export function summarizeDay(input: DaySummaryInput): DaySummary {
  const { dateKey, entries, settings } = input
  const now = input.now ?? new Date()
  const bookings = input.bookings ?? []
  const timeline = buildDayTimeline(entries, settings, now)

  const rawWorkMinutes = sumMinutes(timeline.work)
  const breakMinutes = sumMinutes(timeline.pauses)
  const countedBreakMinutes = sumMinutes(timeline.countedPauses)
  const requiredBreak = requiredBreakMinutes(rawWorkMinutes, settings)

  const missingBreak = Math.max(0, requiredBreak - countedBreakMinutes)
  const autoDeductedMinutes = settings.autoDeductMissingBreak ? missingBreak : 0

  const netMinutes = Math.max(
    0,
    roundMinutes(rawWorkMinutes - autoDeductedMinutes, settings.roundingMinutes)
  )
  const grossMinutes =
    timeline.firstStart !== null && timeline.lastEnd !== null
      ? (timeline.lastEnd - timeline.firstStart) / MS_PER_MINUTE
      : 0

  const targetMinutes = targetMinutesForDate(dateKey, settings)
  const bookedMinutes = bookings.reduce(
    (total, booking) => total + minutesBetween(booking.start, booking.end),
    0
  )

  const issues = collectDayIssues({
    dateKey,
    settings,
    timeline,
    workMinutes: rawWorkMinutes,
    countedBreakMinutes,
    requiredBreak,
    previousDayEnd: input.previousDayEnd ?? null,
    now
  })

  return {
    date: dateKey,
    grossMinutes: Math.round(grossMinutes),
    breakMinutes: Math.round(breakMinutes),
    countedBreakMinutes: Math.round(countedBreakMinutes),
    netMinutes: Math.round(netMinutes),
    autoDeductedMinutes: Math.round(autoDeductedMinutes),
    requiredBreakMinutes: requiredBreak,
    targetMinutes,
    balanceMinutes: Math.round(netMinutes - targetMinutes),
    firstStart: timeline.firstStart !== null ? new Date(timeline.firstStart).toISOString() : null,
    lastEnd:
      timeline.lastEnd !== null && !timeline.running
        ? new Date(timeline.lastEnd).toISOString()
        : null,
    running: timeline.running,
    entryIds: entries.map((entry) => entry.id),
    bookedMinutes: Math.round(bookedMinutes),
    issues
  }
}

interface DayIssueInput {
  dateKey: string
  settings: Settings
  timeline: DayTimeline
  workMinutes: number
  countedBreakMinutes: number
  requiredBreak: number
  previousDayEnd: string | null
  now: Date
}

function collectDayIssues(input: DayIssueInput): ComplianceIssue[] {
  const {
    dateKey,
    settings,
    timeline,
    workMinutes,
    countedBreakMinutes,
    requiredBreak,
    previousDayEnd
  } = input
  const issues: ComplianceIssue[] = []

  if (timeline.work.length === 0) return issues

  /* § 3 ArbZG – Höchstarbeitszeit */
  if (workMinutes > settings.maxExtendedDailyWorkMinutes) {
    issues.push({
      id: `${dateKey}-max-extended`,
      severity: 'error',
      title: `Höchstarbeitszeit von ${formatDuration(settings.maxExtendedDailyWorkMinutes)} überschritten`,
      detail: `Erfasst sind ${formatDuration(workMinutes)}. Die absolute Grenze der werktäglichen Arbeitszeit ist überschritten.`,
      reference: '§ 3 ArbZG',
      date: dateKey
    })
  } else if (workMinutes > settings.maxDailyWorkMinutes) {
    issues.push({
      id: `${dateKey}-max-daily`,
      severity: 'warning',
      title: `Mehr als ${formatDuration(settings.maxDailyWorkMinutes)} gearbeitet`,
      detail: `Erfasst sind ${formatDuration(workMinutes)}. Die Verlängerung ist nur zulässig, wenn im Schnitt von ${settings.averagingPeriodWeeks} Wochen ${formatDuration(settings.maxDailyWorkMinutes)} werktäglich nicht überschritten werden.`,
      reference: '§ 3 ArbZG',
      date: dateKey
    })
  } else if (
    workMinutes > settings.maxDailyWorkMinutes - settings.warningLeadMinutes &&
    timeline.running
  ) {
    issues.push({
      id: `${dateKey}-max-daily-soon`,
      severity: 'info',
      title: `Höchstarbeitszeit fast erreicht`,
      detail: `Noch ${formatDuration(Math.max(0, settings.maxDailyWorkMinutes - workMinutes))} bis zur werktäglichen Höchstarbeitszeit.`,
      reference: '§ 3 ArbZG',
      date: dateKey
    })
  }

  /* § 4 ArbZG – Ruhepausen */
  const missingBreak = Math.round(requiredBreak - countedBreakMinutes)
  if (requiredBreak > 0 && missingBreak > 0) {
    issues.push({
      id: `${dateKey}-break-missing`,
      severity: timeline.running ? 'warning' : 'error',
      title: `Ruhepause um ${formatDuration(missingBreak)} zu kurz`,
      detail: `Bei ${formatDuration(workMinutes)} Arbeitszeit sind ${requiredBreak} Minuten Ruhepause vorgeschrieben, angerechnet sind ${Math.round(countedBreakMinutes)} Minuten.`,
      reference: '§ 4 ArbZG',
      date: dateKey
    })
  } else if (requiredBreak > 0) {
    issues.push({
      id: `${dateKey}-break-ok`,
      severity: 'success',
      title: 'Pausenzeiten eingehalten',
      detail: `${Math.round(countedBreakMinutes)} von ${requiredBreak} vorgeschriebenen Pausenminuten sind angerechnet.`,
      reference: '§ 4 ArbZG',
      date: dateKey
    })
  }

  const nextThreshold =
    workMinutes <= settings.breakThreshold1Minutes
      ? settings.breakThreshold1Minutes
      : workMinutes <= settings.breakThreshold2Minutes
        ? settings.breakThreshold2Minutes
        : null
  if (
    timeline.running &&
    nextThreshold !== null &&
    nextThreshold - workMinutes <= settings.warningLeadMinutes
  ) {
    const nextDuration =
      nextThreshold === settings.breakThreshold1Minutes
        ? settings.breakDuration1Minutes
        : settings.breakDuration2Minutes
    issues.push({
      id: `${dateKey}-break-due-soon`,
      severity: 'info',
      title: `In ${Math.max(0, Math.round(nextThreshold - workMinutes))} Minuten ist eine Pause fällig`,
      detail: `Ab ${formatDuration(nextThreshold)} Arbeitszeit sind ${nextDuration} Minuten Ruhepause vorgeschrieben.`,
      reference: '§ 4 ArbZG',
      date: dateKey
    })
  }

  const uncountedPauses = timeline.pauses.length - timeline.countedPauses.length
  if (uncountedPauses > 0) {
    issues.push({
      id: `${dateKey}-break-fragments`,
      severity: 'info',
      title: `${uncountedPauses} Pausenabschnitt${uncountedPauses === 1 ? '' : 'e'} nicht anrechenbar`,
      detail: `Nur Abschnitte von mindestens ${settings.minBreakBlockMinutes} Minuten gelten als Ruhepause.`,
      reference: '§ 4 Satz 2 ArbZG',
      date: dateKey
    })
  }

  const stretch = longestWorkStretchMinutes(timeline)
  if (stretch > settings.maxWorkWithoutBreakMinutes) {
    issues.push({
      id: `${dateKey}-stretch`,
      severity: 'error',
      title: `${formatDuration(stretch)} ohne Ruhepause gearbeitet`,
      detail: `Ohne Ruhepause dürfen höchstens ${formatDuration(settings.maxWorkWithoutBreakMinutes)} am Stück gearbeitet werden.`,
      reference: '§ 4 Satz 3 ArbZG',
      date: dateKey
    })
  }

  /* § 5 ArbZG – Ruhezeit */
  if (previousDayEnd && timeline.firstStart !== null) {
    const restMinutes = minutesBetween(previousDayEnd, new Date(timeline.firstStart))
    if (restMinutes >= 0 && restMinutes < settings.minRestPeriodMinutes) {
      issues.push({
        id: `${dateKey}-rest`,
        severity: 'warning',
        title: `Ruhezeit von ${formatDuration(settings.minRestPeriodMinutes)} unterschritten`,
        detail: `Zwischen Arbeitsende am Vortag und Arbeitsbeginn liegen nur ${formatDuration(restMinutes)}.`,
        reference: '§ 5 ArbZG',
        date: dateKey
      })
    }
  }

  /* § 9 ArbZG – Sonntagsruhe */
  if (settings.warnOnSundayWork && isoWeekday(`${dateKey}T12:00:00`) === 7) {
    issues.push({
      id: `${dateKey}-sunday`,
      severity: 'warning',
      title: 'Arbeit an einem Sonntag erfasst',
      detail:
        'An Sonn- und gesetzlichen Feiertagen darf grundsätzlich nicht gearbeitet werden; Ausnahmen regelt § 10 ArbZG.',
      reference: '§ 9 ArbZG',
      date: dateKey
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/*                        Auswertung mehrerer Kalendertage                      */
/* -------------------------------------------------------------------------- */

export function groupEntriesByDate(entries: WorkEntry[]): Map<string, WorkEntry[]> {
  const map = new Map<string, WorkEntry[]>()
  for (const entry of entries) {
    const key = entry.date || toDateKey(entry.start)
    const list = map.get(key)
    if (list) list.push(entry)
    else map.set(key, [entry])
  }
  for (const list of map.values()) {
    list.sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime())
  }
  return map
}

export function groupBookingsByDate(bookings: Booking[]): Map<string, Booking[]> {
  const map = new Map<string, Booking[]>()
  for (const booking of bookings) {
    const key = booking.date || toDateKey(booking.start)
    const list = map.get(key)
    if (list) list.push(booking)
    else map.set(key, [booking])
  }
  for (const list of map.values()) {
    list.sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime())
  }
  return map
}

/** Erzeugt Tagesauswertungen für alle angegebenen Kalendertage. */
export function summarizeDays(
  dateKeys: string[],
  entries: WorkEntry[],
  bookings: Booking[],
  settings: Settings,
  now: Date = new Date()
): DaySummary[] {
  const entriesByDate = groupEntriesByDate(entries)
  const bookingsByDate = groupBookingsByDate(bookings)

  return dateKeys.map((dateKey) => {
    const previousKey = toDateKey(addDays(`${dateKey}T12:00:00`, -1))
    const previousEntries = entriesByDate.get(previousKey) ?? []
    const previousTimeline = buildDayTimeline(previousEntries, settings, now)
    const previousDayEnd =
      previousTimeline.lastEnd !== null && !previousTimeline.running
        ? new Date(previousTimeline.lastEnd).toISOString()
        : null

    return summarizeDay({
      dateKey,
      entries: entriesByDate.get(dateKey) ?? [],
      bookings: bookingsByDate.get(dateKey) ?? [],
      settings,
      now,
      previousDayEnd
    })
  })
}

export interface PeriodSummary {
  from: string
  to: string
  days: DaySummary[]
  netMinutes: number
  breakMinutes: number
  targetMinutes: number
  balanceMinutes: number
  bookedMinutes: number
  /** Tage mit mindestens einer Erfassung. */
  workedDays: number
  issues: ComplianceIssue[]
}

export function summarizePeriod(
  dateKeys: string[],
  entries: WorkEntry[],
  bookings: Booking[],
  settings: Settings,
  now: Date = new Date()
): PeriodSummary {
  const days = summarizeDays(dateKeys, entries, bookings, settings, now)
  const netMinutes = days.reduce((total, day) => total + day.netMinutes, 0)
  const breakMinutes = days.reduce((total, day) => total + day.breakMinutes, 0)
  const targetMinutes = days.reduce((total, day) => total + day.targetMinutes, 0)
  const bookedMinutes = days.reduce((total, day) => total + day.bookedMinutes, 0)
  const workedDays = days.filter((day) => day.netMinutes > 0).length

  const issues = days.flatMap((day) => day.issues.filter((issue) => issue.severity !== 'success'))

  return {
    from: dateKeys[0] ?? '',
    to: dateKeys[dateKeys.length - 1] ?? '',
    days,
    netMinutes,
    breakMinutes,
    targetMinutes,
    balanceMinutes: netMinutes - targetMinutes,
    bookedMinutes,
    workedDays,
    issues
  }
}

/**
 * § 3 Satz 2 ArbZG: Prüft, ob die werktägliche Arbeitszeit im Ausgleichszeitraum
 * im Durchschnitt eingehalten wird. Werktage sind Montag bis Samstag.
 */
export function checkAveragingPeriod(
  entries: WorkEntry[],
  settings: Settings,
  reference: Date = new Date()
): ComplianceIssue | null {
  const periodStart = addDays(reference, -settings.averagingPeriodWeeks * 7)
  const relevant = entries.filter((entry) => {
    const start = parseIso(entry.start)
    return start >= periodStart && start <= reference
  })
  if (relevant.length === 0) return null

  const entriesByDate = groupEntriesByDate(relevant)
  let totalMinutes = 0
  let workedWeekdays = 0
  for (const [, dayEntries] of entriesByDate) {
    const timeline = buildDayTimeline(dayEntries, settings, reference)
    const minutes = sumMinutes(timeline.work)
    if (minutes <= 0) continue
    totalMinutes += minutes
    workedWeekdays += 1
  }
  if (workedWeekdays === 0) return null

  const average = totalMinutes / workedWeekdays
  if (average <= settings.maxDailyWorkMinutes) {
    return {
      id: 'averaging-ok',
      severity: 'success',
      title: `Durchschnitt im Ausgleichszeitraum: ${formatDuration(average)}`,
      detail: `Über ${workedWeekdays} erfasste Werktage der letzten ${settings.averagingPeriodWeeks} Wochen liegt die durchschnittliche Arbeitszeit innerhalb von ${formatDuration(settings.maxDailyWorkMinutes)}.`,
      reference: '§ 3 ArbZG'
    }
  }

  return {
    id: 'averaging-exceeded',
    severity: 'error',
    title: `Durchschnitt im Ausgleichszeitraum überschritten (${formatDuration(average)})`,
    detail: `Seit ${formatDate(periodStart)} liegt die durchschnittliche werktägliche Arbeitszeit über ${formatDuration(settings.maxDailyWorkMinutes)}. Ein Ausgleich innerhalb von ${settings.averagingPeriodWeeks} Wochen ist erforderlich.`,
    reference: '§ 3 ArbZG'
  }
}

/* -------------------------------------------------------------------------- */
/*                      Live-Hinweise während der Erfassung                     */
/* -------------------------------------------------------------------------- */

export type BreakStatus = 'idle' | 'ok' | 'due_soon' | 'due' | 'violated'

export interface BreakGuidance {
  status: BreakStatus
  /** Bisher geleistete Nettoarbeitszeit des Tages in Minuten. */
  workMinutes: number
  /** Angerechnete Pausenminuten. */
  countedBreakMinutes: number
  /** Aktuell vorgeschriebene Pausendauer. */
  requiredBreakMinutes: number
  /** Noch fehlende Pausenminuten. */
  missingBreakMinutes: number
  /** Minuten bis zur nächsten Pausenschwelle, `null` wenn alle erreicht sind. */
  minutesUntilNextThreshold: number | null
  /** Nächste Pausenschwelle in Minuten Arbeitszeit. */
  nextThresholdMinutes: number | null
  /** Am Stück geleistete Arbeitszeit. */
  currentStretchMinutes: number
  /** Minuten bis zur 6-Stunden-Grenze ohne Pause. */
  minutesUntilStretchLimit: number
  message: string
}

/** Erzeugt den Pausenhinweis für den laufenden Tag. */
export function breakGuidance(
  entries: WorkEntry[],
  settings: Settings,
  now: Date = new Date()
): BreakGuidance {
  const timeline = buildDayTimeline(entries, settings, now)
  const workMinutes = sumMinutes(timeline.work)
  const countedBreak = sumMinutes(timeline.countedPauses)
  const required = requiredBreakMinutes(workMinutes, settings)
  const missing = Math.max(0, required - countedBreak)
  const stretch = currentWorkStretchMinutes(timeline)
  const untilStretchLimit = settings.maxWorkWithoutBreakMinutes - stretch

  const nextThreshold =
    workMinutes <= settings.breakThreshold1Minutes
      ? settings.breakThreshold1Minutes
      : workMinutes <= settings.breakThreshold2Minutes
        ? settings.breakThreshold2Minutes
        : null
  const untilNextThreshold = nextThreshold === null ? null : Math.max(0, nextThreshold - workMinutes)

  let status: BreakStatus = 'ok'
  let message = ''

  if (workMinutes <= 0) {
    status = 'idle'
    message = 'Noch keine Arbeitszeit erfasst.'
  } else if (untilStretchLimit <= 0) {
    status = 'violated'
    message = `Seit ${formatDuration(stretch)} ohne Ruhepause – nach § 4 ArbZG ist spätestens jetzt eine Pause einzulegen.`
  } else if (missing > 0) {
    status = 'due'
    message = `Es fehlen noch ${Math.round(missing)} Pausenminuten für die heutige Arbeitszeit von ${formatDuration(workMinutes)}.`
  } else if (untilNextThreshold !== null && untilNextThreshold <= settings.warningLeadMinutes) {
    const nextDuration =
      nextThreshold === settings.breakThreshold1Minutes
        ? settings.breakDuration1Minutes
        : settings.breakDuration2Minutes
    status = 'due_soon'
    message = `In ${Math.round(untilNextThreshold)} Minuten werden ${nextDuration} Minuten Ruhepause fällig.`
  } else if (untilNextThreshold !== null) {
    message = `Pausenzeiten eingehalten. Nächste Schwelle in ${formatDuration(untilNextThreshold)}.`
  } else {
    message = `Pausenzeiten eingehalten (${Math.round(countedBreak)} von ${required} Minuten).`
  }

  return {
    status,
    workMinutes,
    countedBreakMinutes: countedBreak,
    requiredBreakMinutes: required,
    missingBreakMinutes: missing,
    minutesUntilNextThreshold: untilNextThreshold,
    nextThresholdMinutes: nextThreshold,
    currentStretchMinutes: stretch,
    minutesUntilStretchLimit: untilStretchLimit,
    message
  }
}

/* -------------------------------------------------------------------------- */
/*                            Prüfung von Buchungen                            */
/* -------------------------------------------------------------------------- */

export interface BookingWarning {
  id: string
  severity: 'warning' | 'info'
  message: string
}

/**
 * Hinweise zu einer Zeitbuchung – Buchungen werden nie blockiert, sondern nur
 * kommentiert.
 */
export function checkBooking(
  booking: Pick<Booking, 'id' | 'date' | 'start' | 'end' | 'project'>,
  context: { settings: Settings; workEntries: WorkEntry[]; bookings: Booking[] }
): BookingWarning[] {
  const { settings, workEntries, bookings } = context
  const warnings: BookingWarning[] = []
  const start = parseIso(booking.start)
  const end = parseIso(booking.end)
  const durationMin = minutesBetween(start, end)

  if (durationMin <= 0) {
    warnings.push({
      id: 'duration',
      severity: 'warning',
      message: 'Das Ende der Buchung liegt vor dem Beginn.'
    })
    return warnings
  }

  if (settings.warnBookingOutsideWorkingHours) {
    const dayEntries = workEntries.filter((entry) => entry.date === booking.date)
    const timeline = buildDayTimeline(dayEntries, settings, new Date())
    if (timeline.work.length === 0) {
      warnings.push({
        id: 'no-worktime',
        severity: 'warning',
        message: `Für den ${formatDate(booking.date)} ist keine Arbeitszeit erfasst. Die Buchung liegt damit außerhalb der Arbeitszeit.`
      })
    } else {
      const covered = timeline.work.reduce(
        (total, segment) =>
          total +
          Math.max(
            0,
            Math.min(segment.end, end.getTime()) - Math.max(segment.start, start.getTime())
          ) /
            MS_PER_MINUTE,
        0
      )
      const outside = Math.round(durationMin - covered)
      if (outside > 0) {
        warnings.push({
          id: 'outside-worktime',
          severity: 'warning',
          message: `${outside} Minuten dieser Buchung liegen außerhalb der erfassten Arbeitszeit (inkl. Pausen).`
        })
      }
    }
  }

  if (settings.warnBookingOverlap) {
    const overlapping = bookings.filter(
      (other) =>
        other.id !== booking.id &&
        other.date === booking.date &&
        parseIso(other.start).getTime() < end.getTime() &&
        parseIso(other.end).getTime() > start.getTime()
    )
    if (overlapping.length > 0) {
      warnings.push({
        id: 'overlap',
        severity: 'info',
        message: `Überschneidung mit ${overlapping.length} weiteren Buchung${
          overlapping.length === 1 ? '' : 'en'
        }: ${overlapping.map((item) => item.project || 'ohne Projekt').join(', ')}.`
      })
    }
  }

  return warnings
}

/** Summiert gebuchte Projektzeit je Tag und vergleicht sie mit der Arbeitszeit. */
export function bookingCoverage(
  dateKey: string,
  entries: WorkEntry[],
  bookings: Booking[],
  settings: Settings,
  now: Date = new Date()
): { bookedMinutes: number; workMinutes: number; differenceMinutes: number } {
  const timeline = buildDayTimeline(
    entries.filter((entry) => entry.date === dateKey),
    settings,
    now
  )
  const workMinutes = sumMinutes(timeline.work)
  const bookedMinutes = bookings
    .filter((booking) => booking.date === dateKey)
    .reduce((total, booking) => total + minutesBetween(booking.start, booking.end), 0)
  return {
    bookedMinutes: Math.round(bookedMinutes),
    workMinutes: Math.round(workMinutes),
    differenceMinutes: Math.round(bookedMinutes - workMinutes)
  }
}
