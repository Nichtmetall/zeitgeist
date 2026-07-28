import type { AppData, BookingColor, Settings } from './types'

export const DATA_VERSION = 1

/**
 * Voreinstellungen orientieren sich am deutschen Arbeitszeitgesetz (ArbZG):
 * 8 h werktägliche Höchstarbeitszeit (§ 3), 30/45 min Ruhepausen (§ 4),
 * 11 h Ruhezeit (§ 5) sowie Sonn- und Feiertagsruhe (§ 9).
 */
export const DEFAULT_SETTINGS: Settings = {
  workdays: [1, 2, 3, 4, 5],
  dailyTargetMinutes: 8 * 60,
  weeklyTargetMinutes: 40 * 60,
  workdayStart: '08:00',
  workdayEnd: '17:00',

  maxDailyWorkMinutes: 8 * 60,
  maxExtendedDailyWorkMinutes: 10 * 60,
  averagingPeriodWeeks: 24,
  breakThreshold1Minutes: 6 * 60,
  breakDuration1Minutes: 30,
  breakThreshold2Minutes: 9 * 60,
  breakDuration2Minutes: 45,
  minBreakBlockMinutes: 15,
  maxWorkWithoutBreakMinutes: 6 * 60,
  minRestPeriodMinutes: 11 * 60,
  warnOnSundayWork: true,
  warningLeadMinutes: 15,

  autoDeductMissingBreak: false,
  roundingMinutes: 0,
  idleTimeoutMinutes: 0,

  ergonomicsEnabled: true,
  ergonomicsSitMinutes: 40,
  ergonomicsStandMinutes: 15,
  ergonomicsMoveMinutes: 5,
  ergonomicsPauseOnBreak: true,
  ergonomicsSystemNotification: true,
  ergonomicsSound: false,

  calendarStartHour: 6,
  calendarEndHour: 20,
  calendarSlotMinutes: 15,
  warnBookingOutsideWorkingHours: true,
  warnBookingOverlap: true,

  csvDelimiter: ';',
  csvDecimalSeparator: ',',
  exportDurationFormat: 'hhmm',
  reportTitle: 'Arbeitszeitnachweis',
  employeeName: '',

  themeMode: 'system',
  themeContrast: 'default',
  weekStartsOn: 1,
  startPage: 'tracker'
}

export const EMPTY_DATA: AppData = {
  version: DATA_VERSION,
  settings: DEFAULT_SETTINGS,
  workEntries: [],
  bookings: [],
  templates: []
}

/** Farbpalette der Zeitbuchungen – abgestimmt auf die Fluent-Designsprache. */
export const BOOKING_COLORS: Record<
  BookingColor,
  { label: string; background: string; border: string; foreground: string }
> = {
  brand: { label: 'Blau', background: '#0f6cbd', border: '#0c3b5e', foreground: '#ffffff' },
  seafoam: { label: 'Türkis', background: '#00786c', border: '#00453e', foreground: '#ffffff' },
  lavender: { label: 'Lavendel', background: '#7160e8', border: '#3f3682', foreground: '#ffffff' },
  peach: { label: 'Pfirsich', background: '#c4633a', border: '#733a22', foreground: '#ffffff' },
  lilac: { label: 'Magenta', background: '#a4262c', border: '#5f1519', foreground: '#ffffff' },
  gold: { label: 'Gold', background: '#8f6200', border: '#4f3600', foreground: '#ffffff' },
  forest: { label: 'Grün', background: '#0e700e', border: '#063b06', foreground: '#ffffff' },
  steel: { label: 'Stahl', background: '#4f5b62', border: '#2b3236', foreground: '#ffffff' }
}

export const BOOKING_COLOR_KEYS = Object.keys(BOOKING_COLORS) as BookingColor[]

export const WORK_KIND_LABELS: Record<string, string> = {
  office: 'Büro',
  homeoffice: 'Homeoffice',
  travel: 'Dienstreise',
  other: 'Sonstiges'
}

export const WEEKDAY_LABELS = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag'
]

export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
