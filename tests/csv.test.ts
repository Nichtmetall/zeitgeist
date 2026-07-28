import { describe, expect, it } from 'vitest'
import { buildCsv, dedupeImport, detectDelimiter, parseCsvText, parseImportCsv } from '@shared/csv'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { combineDateAndTime, toLocalIso } from '@shared/time'
import type { Booking, Settings, WorkEntry } from '@shared/types'

const settings: Settings = { ...DEFAULT_SETTINGS }

/** Zeitstempel in der Zeitzone des ausführenden Rechners. */
function at(dateKey: string, time: string): string {
  return toLocalIso(combineDateAndTime(dateKey, time) as Date)
}

const workEntry: WorkEntry = {
  id: 'w1',
  date: '2024-05-13',
  start: at('2024-05-13', '08:00'),
  end: at('2024-05-13', '17:00'),
  breaks: [
    {
      id: 'b1',
      start: at('2024-05-13', '12:00'),
      end: at('2024-05-13', '12:30')
    }
  ],
  kind: 'homeoffice',
  note: 'Bericht; mit Semikolon',
  createdAt: at('2024-05-13', '08:00'),
  updatedAt: at('2024-05-13', '17:00')
}

const bookingEntry: Booking = {
  id: 'p1',
  date: '2024-05-13',
  start: at('2024-05-13', '09:00'),
  end: at('2024-05-13', '11:30'),
  project: 'Projekt "Alpha"',
  description: 'Konzept erstellt',
  color: 'seafoam',
  billable: true,
  createdAt: at('2024-05-13', '09:00'),
  updatedAt: at('2024-05-13', '09:00')
}

describe('CSV-Parser', () => {
  it('liest Felder mit Anführungszeichen und Trennzeichen', () => {
    const rows = parseCsvText('a;b\r\n"eins;zwei";"er sagte ""hallo"""', ';')
    expect(rows).toEqual([
      ['a', 'b'],
      ['eins;zwei', 'er sagte "hallo"']
    ])
  })

  it('erkennt das Trennzeichen anhand der Kopfzeile', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
  })
})

describe('Export und Import', () => {
  it('schreibt eine Kopfzeile und je eine Zeile pro Datensatz', () => {
    const csv = buildCsv([workEntry], [bookingEntry], settings)
    const lines = csv.split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].startsWith('Typ;Datum;Beginn;Ende')).toBe(true)
    expect(lines[1]).toContain('Arbeitszeit;2024-05-13;08:00;17:00;12:00-12:30')
    expect(lines[1]).toContain('"Bericht; mit Semikolon"')
    expect(lines[2]).toContain('Zeitbuchung;2024-05-13;09:00;11:30')
  })

  it('liest einen eigenen Export verlustfrei wieder ein', () => {
    const csv = buildCsv([workEntry], [bookingEntry], settings)
    const result = parseImportCsv(csv)

    expect(result.errors).toEqual([])
    expect(result.workEntries).toHaveLength(1)
    expect(result.bookings).toHaveLength(1)

    const imported = result.workEntries[0]
    expect(imported.date).toBe('2024-05-13')
    expect(new Date(imported.start).getHours()).toBe(8)
    expect(new Date(imported.end as string).getHours()).toBe(17)
    expect(imported.breaks).toHaveLength(1)
    expect(imported.kind).toBe('homeoffice')
    expect(imported.note).toBe('Bericht; mit Semikolon')

    const importedBooking = result.bookings[0]
    expect(importedBooking.project).toBe('Projekt "Alpha"')
    expect(importedBooking.description).toBe('Konzept erstellt')
    expect(importedBooking.color).toBe('seafoam')
    expect(importedBooking.billable).toBe(true)
  })

  it('akzeptiert fremde Dateien mit deutschem Datumsformat', () => {
    const csv = ['Datum,Beginn,Ende,Notiz', '13.05.2024,8:00,16:30,Kundentermin'].join('\n')
    const result = parseImportCsv(csv)
    expect(result.workEntries).toHaveLength(1)
    expect(result.workEntries[0].date).toBe('2024-05-13')
    expect(result.workEntries[0].note).toBe('Kundentermin')
  })

  it('überspringt fehlerhafte Zeilen und meldet sie', () => {
    const csv = [
      'Typ;Datum;Beginn;Ende',
      'Arbeitszeit;2024-05-13;08:00;17:00',
      'Arbeitszeit;kein-datum;08:00;17:00',
      'Zeitbuchung;2024-05-14;09:00;'
    ].join('\n')
    const result = parseImportCsv(csv)
    expect(result.workEntries).toHaveLength(1)
    expect(result.skipped).toBe(2)
    expect(result.errors).toHaveLength(2)
  })

  it('behandelt eine über Mitternacht laufende Erfassung', () => {
    const csv = ['Typ;Datum;Beginn;Ende', 'Arbeitszeit;2024-05-13;22:00;06:00'].join('\n')
    const result = parseImportCsv(csv)
    const imported = result.workEntries[0]
    expect(new Date(imported.end as string).getDate()).toBe(14)
  })

  it('erkennt Duplikate gegenüber vorhandenen Daten', () => {
    const csv = buildCsv([workEntry], [bookingEntry], settings)
    const parsed = parseImportCsv(csv)
    const deduped = dedupeImport(parsed, {
      workEntries: parsed.workEntries,
      bookings: parsed.bookings
    })
    expect(deduped.workEntries).toHaveLength(0)
    expect(deduped.bookings).toHaveLength(0)
    expect(deduped.duplicates).toBe(2)
  })
})
