/**
 * Aufbereitung der Daten für Berichte (PDF und XLSX).
 *
 * Der Renderer erzeugt aus den lokalen Daten ein serialisierbares
 * `ReportModel`; PDF- und Excel-Ausgabe rendern anschließend nur noch dieses
 * Modell. Dadurch sind beide Formate garantiert inhaltsgleich.
 */

import { summarizePeriod, type PeriodSummary } from './arbzg'
import { WORK_KIND_LABELS } from './defaults'
import {
  dateKeyRange,
  formatBalance,
  formatDate,
  formatDateLong,
  formatDecimalHours,
  formatDuration,
  formatTime,
  minutesBetween
} from './time'
import type { Booking, ExportRequest, Settings, WorkEntry } from './types'

export interface ReportColumn {
  header: string
  /** Relative Spaltenbreite für Excel/PDF. */
  width: number
  align?: 'left' | 'right' | 'center'
}

export interface ReportSection {
  id: string
  title: string
  columns: ReportColumn[]
  rows: string[][]
  emptyHint?: string
}

export interface ReportModel {
  title: string
  employee: string
  periodLabel: string
  generatedAt: string
  summary: { label: string; value: string }[]
  sections: ReportSection[]
  notes: { severity: string; text: string }[]
  /** Vorschlag für den Dateinamen ohne Endung. */
  fileBaseName: string
}

function formatMinutes(minutes: number, settings: Settings): string {
  return settings.exportDurationFormat === 'decimal'
    ? formatDecimalHours(minutes, settings.csvDecimalSeparator)
    : formatDuration(minutes, false)
}

function breakLabel(entry: WorkEntry): string {
  const parts = entry.breaks
    .filter((pause) => pause.end)
    .map((pause) => `${formatTime(pause.start)}–${formatTime(pause.end as string)}`)
  return parts.join(', ')
}

export function buildReport(
  request: ExportRequest,
  data: { workEntries: WorkEntry[]; bookings: Booking[]; settings: Settings },
  now: Date = new Date()
): ReportModel {
  const { settings } = data
  const dateKeys = dateKeyRange(request.from, request.to)
  const inRange = <T extends { date: string }>(items: T[]): T[] =>
    items
      .filter((item) => item.date >= request.from && item.date <= request.to)
      .sort((a, b) => a.date.localeCompare(b.date))

  const workEntries = inRange(data.workEntries)
  const bookings = inRange(data.bookings)
  const period: PeriodSummary = summarizePeriod(
    dateKeys,
    workEntries,
    bookings,
    settings,
    now
  )

  const sections: ReportSection[] = []

  if (request.dataset === 'workEntries' || request.dataset === 'both') {
    sections.push({
      id: 'workEntries',
      title: 'Arbeitszeiten',
      columns: [
        { header: 'Datum', width: 14 },
        { header: 'Beginn', width: 9, align: 'right' },
        { header: 'Ende', width: 9, align: 'right' },
        { header: 'Pausen', width: 22 },
        { header: 'Pause', width: 9, align: 'right' },
        { header: 'Netto', width: 9, align: 'right' },
        { header: 'Art', width: 12 },
        { header: 'Notiz', width: 30 }
      ],
      rows: workEntries.map((entry) => {
        const breakMinutes = entry.breaks.reduce(
          (total, pause) => (pause.end ? total + minutesBetween(pause.start, pause.end) : total),
          0
        )
        const netMinutes = entry.end
          ? Math.max(0, minutesBetween(entry.start, entry.end) - breakMinutes)
          : 0
        return [
          formatDate(entry.date),
          formatTime(entry.start),
          entry.end ? formatTime(entry.end) : 'läuft',
          breakLabel(entry),
          formatMinutes(breakMinutes, settings),
          formatMinutes(netMinutes, settings),
          WORK_KIND_LABELS[entry.kind] ?? entry.kind,
          entry.note ?? ''
        ]
      }),
      emptyHint: 'Im gewählten Zeitraum wurden keine Arbeitszeiten erfasst.'
    })
  }

  if (request.dataset === 'bookings' || request.dataset === 'both') {
    sections.push({
      id: 'bookings',
      title: 'Zeitbuchungen (Projekte und Aufgaben)',
      columns: [
        { header: 'Datum', width: 14 },
        { header: 'Von', width: 9, align: 'right' },
        { header: 'Bis', width: 9, align: 'right' },
        { header: 'Dauer', width: 9, align: 'right' },
        { header: 'Projekt', width: 24 },
        { header: 'Beschreibung', width: 40 },
        { header: 'Abrechenbar', width: 12, align: 'center' }
      ],
      rows: bookings.map((booking) => [
        formatDate(booking.date),
        formatTime(booking.start),
        formatTime(booking.end),
        formatMinutes(minutesBetween(booking.start, booking.end), settings),
        booking.project,
        booking.description,
        booking.billable ? 'ja' : 'nein'
      ]),
      emptyHint: 'Im gewählten Zeitraum wurden keine Zeitbuchungen erfasst.'
    })
  }

  if (request.includeSummary) {
    sections.push({
      id: 'daily',
      title: 'Tagesübersicht',
      columns: [
        { header: 'Datum', width: 14 },
        { header: 'Beginn', width: 9, align: 'right' },
        { header: 'Ende', width: 9, align: 'right' },
        { header: 'Pause', width: 9, align: 'right' },
        { header: 'Netto', width: 9, align: 'right' },
        { header: 'Soll', width: 9, align: 'right' },
        { header: 'Saldo', width: 10, align: 'right' },
        { header: 'Gebucht', width: 9, align: 'right' },
        { header: 'Hinweise', width: 34 }
      ],
      rows: period.days
        .filter((day) => day.entryIds.length > 0 || day.bookedMinutes > 0)
        .map((day) => [
          formatDate(day.date),
          day.firstStart ? formatTime(day.firstStart) : '',
          day.lastEnd ? formatTime(day.lastEnd) : day.running ? 'läuft' : '',
          formatMinutes(day.breakMinutes, settings),
          formatMinutes(day.netMinutes, settings),
          formatMinutes(day.targetMinutes, settings),
          formatBalance(day.balanceMinutes).replace(' h', ''),
          formatMinutes(day.bookedMinutes, settings),
          day.issues
            .filter((issue) => issue.severity !== 'success' && issue.severity !== 'info')
            .map((issue) => `${issue.reference ?? ''} ${issue.title}`.trim())
            .join('; ')
        ]),
      emptyHint: 'Keine Tagesdaten im gewählten Zeitraum.'
    })

    const projects = new Map<string, number>()
    for (const booking of bookings) {
      const key = booking.project || 'Ohne Projekt'
      projects.set(key, (projects.get(key) ?? 0) + minutesBetween(booking.start, booking.end))
    }
    if (projects.size > 0) {
      const total = [...projects.values()].reduce((sum, value) => sum + value, 0)
      sections.push({
        id: 'projects',
        title: 'Projektübersicht',
        columns: [
          { header: 'Projekt', width: 34 },
          { header: 'Dauer', width: 12, align: 'right' },
          { header: 'Anteil', width: 10, align: 'right' }
        ],
        rows: [...projects.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([project, minutes]) => [
            project,
            formatMinutes(minutes, settings),
            `${Math.round((minutes / Math.max(1, total)) * 100)} %`
          ])
      })
    }
  }

  const summary = [
    { label: 'Zeitraum', value: `${formatDate(request.from)} – ${formatDate(request.to)}` },
    { label: 'Erfasste Arbeitstage', value: String(period.workedDays) },
    { label: 'Nettoarbeitszeit', value: formatDuration(period.netMinutes) },
    { label: 'Pausenzeit', value: formatDuration(period.breakMinutes) },
    { label: 'Sollarbeitszeit', value: formatDuration(period.targetMinutes) },
    { label: 'Saldo', value: formatBalance(period.balanceMinutes) },
    { label: 'Gebuchte Projektzeit', value: formatDuration(period.bookedMinutes) }
  ]

  const notes = period.issues.slice(0, 40).map((issue) => ({
    severity: issue.severity,
    text: `${issue.date ? `${formatDate(issue.date)}: ` : ''}${issue.title}${
      issue.reference ? ` (${issue.reference})` : ''
    }`
  }))

  return {
    title: settings.reportTitle || 'Arbeitszeitnachweis',
    employee: settings.employeeName,
    periodLabel:
      request.from === request.to
        ? formatDateLong(request.from)
        : `${formatDate(request.from)} – ${formatDate(request.to)}`,
    generatedAt: `${formatDate(now)} ${formatTime(now)}`,
    summary,
    sections,
    notes,
    fileBaseName: `zeitwerk_${request.from}_bis_${request.to}`
  }
}
