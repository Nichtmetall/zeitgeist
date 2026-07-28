import { describe, expect, it } from 'vitest'
import {
  breakGuidance,
  buildDayTimeline,
  checkAveragingPeriod,
  checkBooking,
  longestWorkStretchMinutes,
  mergeIntervals,
  requiredBreakMinutes,
  subtractIntervals,
  summarizeDay,
  summarizePeriod,
  targetMinutesForDate
} from '@shared/arbzg'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { Booking, BreakInterval, Settings, WorkEntry } from '@shared/types'

const settings: Settings = { ...DEFAULT_SETTINGS }

function at(dateKey: string, time: string): string {
  return `${dateKey}T${time}:00.000`
}

let counter = 0

function entry(
  dateKey: string,
  start: string,
  end: string | null,
  breaks: [string, string | null][] = []
): WorkEntry {
  counter += 1
  return {
    id: `entry-${counter}`,
    date: dateKey,
    start: at(dateKey, start),
    end: end ? at(dateKey, end) : null,
    breaks: breaks.map<BreakInterval>(([from, to], index) => ({
      id: `break-${counter}-${index}`,
      start: at(dateKey, from),
      end: to ? at(dateKey, to) : null
    })),
    kind: 'office',
    createdAt: at(dateKey, start),
    updatedAt: at(dateKey, start)
  }
}

function booking(dateKey: string, start: string, end: string, project = 'Projekt A'): Booking {
  counter += 1
  return {
    id: `booking-${counter}`,
    date: dateKey,
    start: at(dateKey, start),
    end: at(dateKey, end),
    project,
    description: 'Aufgabe',
    color: 'brand',
    billable: true,
    createdAt: at(dateKey, start),
    updatedAt: at(dateKey, start)
  }
}

const MONDAY = '2024-05-13'
const SUNDAY = '2024-05-19'
const NOW = new Date(`${MONDAY}T23:00:00`)

describe('Intervallrechnung', () => {
  it('vereinigt überlappende Intervalle', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 5, end: 20 },
        { start: 30, end: 40 }
      ])
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 }
    ])
  })

  it('zieht Pausen aus Arbeitsintervallen heraus', () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }])).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 }
    ])
  })
})

describe('§ 4 ArbZG – Ruhepausen', () => {
  it('verlangt 30 Minuten über 6 Stunden und 45 Minuten über 9 Stunden', () => {
    expect(requiredBreakMinutes(360, settings)).toBe(0)
    expect(requiredBreakMinutes(361, settings)).toBe(30)
    expect(requiredBreakMinutes(540, settings)).toBe(30)
    expect(requiredBreakMinutes(541, settings)).toBe(45)
  })

  it('meldet eine zu kurze Ruhepause', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '08:00', '18:00', [['12:00', '12:30']])],
      settings,
      now: NOW
    })
    expect(summary.netMinutes).toBe(570)
    expect(summary.requiredBreakMinutes).toBe(45)
    const issue = summary.issues.find((item) => item.id.endsWith('break-missing'))
    expect(issue?.severity).toBe('error')
    expect(issue?.title).toContain('0:15')
  })

  it('bestätigt eingehaltene Pausenzeiten', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '08:00', '17:00', [['12:00', '12:30']])],
      settings,
      now: NOW
    })
    expect(summary.netMinutes).toBe(510)
    expect(summary.countedBreakMinutes).toBe(30)
    expect(summary.issues.some((item) => item.id.endsWith('break-ok'))).toBe(true)
    expect(summary.issues.some((item) => item.severity === 'error')).toBe(false)
  })

  it('wertet Lücken zwischen zwei Erfassungen als Pause', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '08:00', '12:00'), entry(MONDAY, '12:45', '17:00')],
      settings,
      now: NOW
    })
    expect(summary.breakMinutes).toBe(45)
    expect(summary.countedBreakMinutes).toBe(45)
    expect(summary.netMinutes).toBe(495)
    expect(summary.issues.some((item) => item.severity === 'error')).toBe(false)
  })

  it('rechnet Pausenabschnitte unter 15 Minuten nicht an', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [
        entry(MONDAY, '08:00', '17:00', [
          ['10:00', '10:10'],
          ['12:00', '12:20'],
          ['15:00', '15:10']
        ])
      ],
      settings,
      now: NOW
    })
    expect(summary.breakMinutes).toBe(40)
    expect(summary.countedBreakMinutes).toBe(20)
    expect(summary.issues.some((item) => item.id.endsWith('break-fragments'))).toBe(true)
    expect(summary.issues.some((item) => item.id.endsWith('break-missing'))).toBe(true)
  })

  it('meldet mehr als sechs Stunden Arbeit am Stück', () => {
    const timeline = buildDayTimeline(
      [entry(MONDAY, '08:00', '17:00', [['15:00', '15:30']])],
      settings,
      NOW
    )
    expect(longestWorkStretchMinutes(timeline)).toBe(420)

    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '08:00', '17:00', [['15:00', '15:30']])],
      settings,
      now: NOW
    })
    expect(summary.issues.some((item) => item.id.endsWith('stretch'))).toBe(true)
  })

  it('zieht fehlende Pausen ab, wenn dies eingestellt ist', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '08:00', '15:00')],
      settings: { ...settings, autoDeductMissingBreak: true },
      now: NOW
    })
    expect(summary.autoDeductedMinutes).toBe(30)
    expect(summary.netMinutes).toBe(390)
  })
})

describe('§ 3 ArbZG – Höchstarbeitszeit', () => {
  it('warnt oberhalb von acht Stunden', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '07:00', '16:30', [['12:00', '12:45']])],
      settings,
      now: NOW
    })
    expect(summary.netMinutes).toBe(525)
    const issue = summary.issues.find((item) => item.id.endsWith('max-daily'))
    expect(issue?.severity).toBe('warning')
  })

  it('meldet einen Verstoß oberhalb von zehn Stunden', () => {
    const summary = summarizeDay({
      dateKey: MONDAY,
      entries: [entry(MONDAY, '06:00', '17:00', [['12:00', '12:45']])],
      settings,
      now: NOW
    })
    expect(summary.netMinutes).toBe(615)
    expect(summary.issues.some((item) => item.id.endsWith('max-extended'))).toBe(true)
  })

  it('prüft den Durchschnitt im Ausgleichszeitraum', () => {
    const days = ['2024-05-06', '2024-05-07', '2024-05-08', '2024-05-09', '2024-05-10']
    const entries = days.map((day) => entry(day, '07:00', '18:00', [['12:00', '12:45']]))
    const result = checkAveragingPeriod(entries, settings, new Date('2024-05-13T20:00:00'))
    expect(result?.severity).toBe('error')
    expect(result?.reference).toBe('§ 3 ArbZG')
  })

  it('bestätigt einen unauffälligen Durchschnitt', () => {
    const entries = [entry('2024-05-06', '08:00', '16:30', [['12:00', '12:30']])]
    const result = checkAveragingPeriod(entries, settings, new Date('2024-05-13T20:00:00'))
    expect(result?.severity).toBe('success')
  })
})

describe('§ 5 und § 9 ArbZG', () => {
  it('meldet eine zu kurze Ruhezeit zwischen zwei Tagen', () => {
    const summaries = summarizePeriod(
      ['2024-05-13', '2024-05-14'],
      [
        entry('2024-05-13', '13:00', '22:00', [['17:00', '17:30']]),
        entry('2024-05-14', '06:00', '14:00', [['10:00', '10:30']])
      ],
      [],
      settings,
      new Date('2024-05-14T20:00:00')
    )
    const restIssue = summaries.days[1].issues.find((item) => item.id.endsWith('rest'))
    expect(restIssue?.reference).toBe('§ 5 ArbZG')
    expect(restIssue?.detail).toContain('8:00')
  })

  it('weist auf Sonntagsarbeit hin', () => {
    const summary = summarizeDay({
      dateKey: SUNDAY,
      entries: [entry(SUNDAY, '09:00', '12:00')],
      settings,
      now: new Date(`${SUNDAY}T20:00:00`)
    })
    expect(summary.issues.some((item) => item.reference === '§ 9 ArbZG')).toBe(true)
  })

  it('berücksichtigt Arbeitstage bei der Sollzeit', () => {
    expect(targetMinutesForDate(MONDAY, settings)).toBe(480)
    expect(targetMinutesForDate(SUNDAY, settings)).toBe(0)
  })
})

describe('Live-Hinweis zur Pause', () => {
  it('meldet die nächste Pausenschwelle rechtzeitig', () => {
    const now = new Date(at(MONDAY, '13:50'))
    const guidance = breakGuidance([entry(MONDAY, '08:00', null)], settings, now)
    expect(guidance.status).toBe('due_soon')
    expect(Math.round(guidance.minutesUntilNextThreshold ?? -1)).toBe(10)
  })

  it('meldet eine offene Pause nach sechs Stunden', () => {
    const now = new Date(at(MONDAY, '14:30'))
    const guidance = breakGuidance([entry(MONDAY, '08:00', null)], settings, now)
    expect(guidance.status).toBe('violated')
    expect(guidance.missingBreakMinutes).toBe(30)
  })

  it('ist ohne Erfassung untätig', () => {
    const guidance = breakGuidance([], settings, new Date(at(MONDAY, '09:00')))
    expect(guidance.status).toBe('idle')
  })

  it('gilt als erfüllt, sobald die Pause erfasst ist', () => {
    const now = new Date(at(MONDAY, '15:00'))
    const guidance = breakGuidance(
      [entry(MONDAY, '08:00', null, [['12:00', '12:30']])],
      settings,
      now
    )
    expect(guidance.status).toBe('ok')
    expect(guidance.missingBreakMinutes).toBe(0)
  })
})

describe('Hinweise zu Zeitbuchungen', () => {
  const workday = [entry(MONDAY, '08:00', '17:00', [['12:00', '12:30']])]

  it('akzeptiert Buchungen innerhalb der Arbeitszeit', () => {
    const warnings = checkBooking(booking(MONDAY, '09:00', '10:00'), {
      settings,
      workEntries: workday,
      bookings: []
    })
    expect(warnings).toHaveLength(0)
  })

  it('warnt bei Buchungen außerhalb der Arbeitszeit, ohne sie zu blockieren', () => {
    const warnings = checkBooking(booking(MONDAY, '18:00', '19:00'), {
      settings,
      workEntries: workday,
      bookings: []
    })
    expect(warnings[0].id).toBe('outside-worktime')
    expect(warnings[0].severity).toBe('warning')
    expect(warnings[0].message).toContain('60 Minuten')
  })

  it('warnt, wenn für den Tag keine Arbeitszeit erfasst ist', () => {
    const warnings = checkBooking(booking('2024-05-14', '09:00', '10:00'), {
      settings,
      workEntries: workday,
      bookings: []
    })
    expect(warnings[0].id).toBe('no-worktime')
  })

  it('meldet Überschneidungen als Hinweis', () => {
    const existing = booking(MONDAY, '09:00', '11:00', 'Projekt B')
    const warnings = checkBooking(booking(MONDAY, '10:00', '10:30'), {
      settings,
      workEntries: workday,
      bookings: [existing]
    })
    expect(warnings.some((warning) => warning.id === 'overlap')).toBe(true)
  })
})

describe('Zeitraumauswertung', () => {
  it('summiert Netto-, Soll- und Buchungszeiten', () => {
    const period = summarizePeriod(
      ['2024-05-13', '2024-05-14'],
      [
        entry('2024-05-13', '08:00', '16:30', [['12:00', '12:30']]),
        entry('2024-05-14', '08:00', '16:30', [['12:00', '12:30']])
      ],
      [booking('2024-05-13', '09:00', '12:00')],
      settings,
      new Date('2024-05-14T20:00:00')
    )
    expect(period.netMinutes).toBe(960)
    expect(period.targetMinutes).toBe(960)
    expect(period.balanceMinutes).toBe(0)
    expect(period.bookedMinutes).toBe(180)
    expect(period.workedDays).toBe(2)
  })
})
