import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { buildReport } from '@shared/report'
import { combineDateAndTime, toLocalIso } from '@shared/time'
import { toWinAnsi } from '@shared/winansi'
import type { Booking, ExportRequest, Settings, WorkEntry } from '@shared/types'

const settings: Settings = { ...DEFAULT_SETTINGS, employeeName: 'Anna Müller' }

function at(dateKey: string, time: string): string {
  return toLocalIso(combineDateAndTime(dateKey, time) as Date)
}

const workEntries: WorkEntry[] = [
  {
    id: 'w1',
    date: '2024-05-13',
    start: at('2024-05-13', '08:00'),
    end: at('2024-05-13', '17:00'),
    breaks: [{ id: 'b1', start: at('2024-05-13', '12:00'), end: at('2024-05-13', '12:30') }],
    kind: 'office',
    createdAt: at('2024-05-13', '08:00'),
    updatedAt: at('2024-05-13', '17:00')
  },
  {
    id: 'w2',
    date: '2024-05-14',
    start: at('2024-05-14', '08:00'),
    end: at('2024-05-14', '15:00'),
    breaks: [],
    kind: 'homeoffice',
    createdAt: at('2024-05-14', '08:00'),
    updatedAt: at('2024-05-14', '15:00')
  }
]

const bookings: Booking[] = [
  {
    id: 'p1',
    date: '2024-05-13',
    start: at('2024-05-13', '09:00'),
    end: at('2024-05-13', '11:00'),
    project: 'Kundenportal',
    description: 'Suchfunktion',
    color: 'brand',
    billable: true,
    createdAt: at('2024-05-13', '09:00'),
    updatedAt: at('2024-05-13', '09:00')
  }
]

const request: ExportRequest = {
  format: 'pdf',
  dataset: 'both',
  from: '2024-05-13',
  to: '2024-05-14',
  includeSummary: true
}

describe('Berichtsmodell', () => {
  const report = buildReport(
    request,
    { workEntries, bookings, settings },
    new Date('2024-05-15T09:00:00')
  )

  it('enthält alle Abschnitte mit Excel-tauglichen Blattnamen', () => {
    expect(report.sections.map((section) => section.id)).toEqual([
      'workEntries',
      'bookings',
      'daily',
      'projects'
    ])
    for (const section of report.sections) {
      expect(section.sheetName.length).toBeGreaterThan(0)
      expect(section.sheetName.length).toBeLessThanOrEqual(31)
      expect(section.rows.every((row) => row.length === section.columns.length)).toBe(true)
    }
  })

  it('führt Kennzahlen und Zeitraum im Kopf', () => {
    expect(report.employee).toBe('Anna Müller')
    expect(report.periodLabel).toBe('13.05.2024 – 14.05.2024')
    expect(report.fileBaseName).toBe('zeitwerk_2024-05-13_bis_2024-05-14')
    const values = Object.fromEntries(report.summary.map((item) => [item.label, item.value]))
    expect(values['Nettoarbeitszeit']).toBe('15:30 h')
    expect(values['Gebuchte Projektzeit']).toBe('2:00 h')
    expect(values['Erfasste Arbeitstage']).toBe('2')
  })

  it('meldet die fehlende Ruhepause des zweiten Tages', () => {
    expect(report.notes.some((note) => note.text.includes('Ruhepause'))).toBe(true)
  })

  it('beschränkt sich auf den gewählten Zeitraum', () => {
    const single = buildReport(
      { ...request, to: '2024-05-13' },
      { workEntries, bookings, settings },
      new Date('2024-05-15T09:00:00')
    )
    const section = single.sections.find((item) => item.id === 'workEntries')
    expect(section?.rows).toHaveLength(1)
  })
})

describe('WinAnsi-Aufbereitung für den PDF-Export', () => {
  it('behält Umlaute, Paragraphenzeichen und Gedankenstriche', () => {
    expect(toWinAnsi('Büro · § 4 ArbZG – Größe')).toBe('Büro · § 4 ArbZG – Größe')
  })

  it('ersetzt Zeichen, die die Standardschrift nicht kennt', () => {
    expect(toWinAnsi('\u22120:30 h')).toBe('-0:30 h')
    expect(toWinAnsi('fertig \u2713')).toBe('fertig ok')
    expect(toWinAnsi('Ziel \u2192 Start')).toBe('Ziel -> Start')
    expect(toWinAnsi('Notiz 🙂')).toBe('Notiz ?')
  })

  it('erzeugt Salden ohne typografisches Minus', () => {
    const negative = buildReport(
      { ...request, dataset: 'workEntries', includeSummary: false },
      { workEntries: [], bookings: [], settings },
      new Date('2024-05-15T09:00:00')
    )
    const values = negative.summary.map((item) => item.value).join(' ')
    expect(values).toContain('-16:00 h')
    expect(values).not.toContain('\u2212')
  })
})
