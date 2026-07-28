import { describe, expect, it } from 'vitest'
import {
  combineDateAndTime,
  dateKeyRange,
  formatBalance,
  formatDecimalHours,
  formatDuration,
  isoWeekNumber,
  isoWeekday,
  minutesBetween,
  minutesToHhMm,
  overlapMinutes,
  parseHhMm,
  roundMinutes,
  startOfWeek,
  toDateKey,
  toLocalIso
} from '@shared/time'

describe('Zeitformatierung', () => {
  it('liest Uhrzeiten im Format HH:mm', () => {
    expect(parseHhMm('08:30')).toBe(510)
    expect(parseHhMm('0:05')).toBe(5)
    expect(parseHhMm('24:00')).toBeNull()
    expect(parseHhMm('12:60')).toBeNull()
    expect(parseHhMm('abc')).toBeNull()
  })

  it('formatiert Minuten als Uhrzeit', () => {
    expect(minutesToHhMm(510)).toBe('08:30')
    expect(minutesToHhMm(0)).toBe('00:00')
    expect(minutesToHhMm(1440)).toBe('00:00')
  })

  it('formatiert Dauern mit Vorzeichen', () => {
    expect(formatDuration(485)).toBe('8:05 h')
    expect(formatDuration(-30)).toBe('−0:30 h')
    expect(formatBalance(0)).toBe('±0:00 h')
    expect(formatBalance(45)).toBe('+0:45 h')
    expect(formatDecimalHours(90)).toBe('1,50')
    expect(formatDecimalHours(90, '.')).toBe('1.50')
  })

  it('rundet auf ein Vielfaches', () => {
    expect(roundMinutes(487, 15)).toBe(480)
    expect(roundMinutes(488, 15)).toBe(495)
    expect(roundMinutes(487, 0)).toBe(487)
  })
})

describe('Kalenderrechnung', () => {
  it('bestimmt den ISO-Wochentag', () => {
    expect(isoWeekday('2024-05-13T10:00:00')).toBe(1)
    expect(isoWeekday('2024-05-19T10:00:00')).toBe(7)
  })

  it('bestimmt den Wochenbeginn', () => {
    expect(toDateKey(startOfWeek('2024-05-15T10:00:00', 1))).toBe('2024-05-13')
    expect(toDateKey(startOfWeek('2024-05-15T10:00:00', 7))).toBe('2024-05-12')
  })

  it('berechnet die Kalenderwoche nach ISO 8601', () => {
    expect(isoWeekNumber('2024-01-01T10:00:00')).toBe(1)
    expect(isoWeekNumber('2024-05-13T10:00:00')).toBe(20)
    expect(isoWeekNumber('2021-01-01T10:00:00')).toBe(53)
  })

  it('erzeugt Datumsbereiche einschließlich der Grenzen', () => {
    expect(dateKeyRange('2024-05-13', '2024-05-16')).toEqual([
      '2024-05-13',
      '2024-05-14',
      '2024-05-15',
      '2024-05-16'
    ])
    expect(dateKeyRange('2024-05-13', '2024-05-13')).toHaveLength(1)
  })

  it('behält Zeitpunkte über den ISO-String hinweg bei', () => {
    const date = combineDateAndTime('2024-05-13', '08:30')
    expect(date).not.toBeNull()
    const iso = toLocalIso(date as Date)
    expect(iso.startsWith('2024-05-13T08:30:00')).toBe(true)
    expect(new Date(iso).getTime()).toBe((date as Date).getTime())
  })

  it('misst Differenzen und Überschneidungen in Minuten', () => {
    expect(minutesBetween('2024-05-13T08:00:00', '2024-05-13T16:30:00')).toBe(510)
    expect(
      overlapMinutes(
        '2024-05-13T08:00:00',
        '2024-05-13T12:00:00',
        '2024-05-13T11:30:00',
        '2024-05-13T13:00:00'
      )
    ).toBe(30)
    expect(
      overlapMinutes(
        '2024-05-13T08:00:00',
        '2024-05-13T09:00:00',
        '2024-05-13T10:00:00',
        '2024-05-13T11:00:00'
      )
    ).toBe(0)
  })
})
