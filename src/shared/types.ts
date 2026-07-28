/**
 * Zentrale Datentypen der Anwendung.
 *
 * Alle Zeitpunkte werden als ISO-8601-Strings mit lokaler Zeitzone gespeichert
 * (`2024-05-13T08:30:00.000+02:00`), Datumsangaben als `YYYY-MM-DD`.
 */

/** Ein einzelner Pausenabschnitt innerhalb einer Arbeitszeiterfassung. */
export interface BreakInterval {
  id: string
  /** ISO-Zeitstempel des Pausenbeginns. */
  start: string
  /** ISO-Zeitstempel des Pausenendes, `null` solange die Pause läuft. */
  end: string | null
  /** Frei wählbarer Kommentar, z. B. "Mittagspause". */
  note?: string
}

/** Art der erfassten Arbeitszeit. */
export type WorkKind = 'office' | 'homeoffice' | 'travel' | 'other'

/** Eine Arbeitszeiterfassung (ein zusammenhängender Arbeitsabschnitt inkl. Pausen). */
export interface WorkEntry {
  id: string
  /** Kalendertag der Erfassung im Format `YYYY-MM-DD` (abgeleitet vom Beginn). */
  date: string
  /** ISO-Zeitstempel des Arbeitsbeginns. */
  start: string
  /** ISO-Zeitstempel des Arbeitsendes, `null` solange die Erfassung läuft. */
  end: string | null
  breaks: BreakInterval[]
  kind: WorkKind
  note?: string
  createdAt: string
  updatedAt: string
}

/** Eine Projekt-/Aufgabenbuchung (Arbeitsnachweis, keine Arbeitszeiterfassung). */
export interface Booking {
  id: string
  date: string
  start: string
  end: string
  project: string
  /** Beschreibung der Aufgabe. */
  description: string
  /** Optionale Referenz auf die verwendete Vorlage. */
  templateId?: string
  /** Farbschlüssel aus `BOOKING_COLORS`. */
  color: BookingColor
  billable: boolean
  createdAt: string
  updatedAt: string
}

export type BookingColor =
  'brand' | 'seafoam' | 'lavender' | 'peach' | 'lilac' | 'gold' | 'forest' | 'steel'

/** Vorlage zum schnellen Anlegen wiederkehrender Zeitbuchungen. */
export interface BookingTemplate {
  id: string
  name: string
  project: string
  description: string
  /** Standarddauer in Minuten, wird beim Anlegen per Klick verwendet. */
  defaultDurationMinutes: number
  color: BookingColor
  billable: boolean
  createdAt: string
}

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeContrast = 'default' | 'highContrast'

/** Sämtliche konfigurierbaren Parameter der Anwendung. */
export interface Settings {
  /* ---------------------------------------------------------------- Sollzeit */
  /** Wochentage, an denen gearbeitet wird (1 = Montag … 7 = Sonntag, ISO-8601). */
  workdays: number[]
  /** Tägliche Sollarbeitszeit in Minuten (ohne Pausen). */
  dailyTargetMinutes: number
  /** Wöchentliche Sollarbeitszeit in Minuten (ohne Pausen). */
  weeklyTargetMinutes: number
  /** Regulärer Beginn des Arbeitstags (`HH:mm`) – Basis für Hinweise. */
  workdayStart: string
  /** Reguläres Ende des Arbeitstags (`HH:mm`). */
  workdayEnd: string

  /* ------------------------------------------------------------------- ArbZG */
  /** § 3 ArbZG: werktägliche Höchstarbeitszeit in Minuten (8 h). */
  maxDailyWorkMinutes: number
  /** § 3 Satz 2 ArbZG: Verlängerung auf 10 h bei Ausgleich. */
  maxExtendedDailyWorkMinutes: number
  /** Ausgleichszeitraum in Wochen, in dem der 8-h-Schnitt gehalten werden muss (24 Wochen). */
  averagingPeriodWeeks: number
  /** § 4 ArbZG: Schwelle 1 – ab dieser Arbeitszeit (Minuten) ist eine Pause fällig (> 6 h). */
  breakThreshold1Minutes: number
  /** Erforderliche Pausendauer nach Schwelle 1 (30 min). */
  breakDuration1Minutes: number
  /** § 4 ArbZG: Schwelle 2 (> 9 h). */
  breakThreshold2Minutes: number
  /** Erforderliche Pausendauer nach Schwelle 2 (45 min). */
  breakDuration2Minutes: number
  /** § 4 Satz 2 ArbZG: Mindestlänge eines anrechenbaren Pausenabschnitts (15 min). */
  minBreakBlockMinutes: number
  /** § 4 Satz 3 ArbZG: maximale Arbeitszeit am Stück ohne Pause (6 h). */
  maxWorkWithoutBreakMinutes: number
  /** § 5 ArbZG: ununterbrochene Ruhezeit nach Arbeitsende in Minuten (11 h). */
  minRestPeriodMinutes: number
  /** § 9 ArbZG: Hinweis bei Arbeit an Sonn- und Feiertagen. */
  warnOnSundayWork: boolean
  /** Vorwarnzeit in Minuten, bevor eine gesetzliche Grenze erreicht wird. */
  warningLeadMinutes: number

  /* -------------------------------------------------------------- Erfassung */
  /** Nicht erfasste, aber gesetzlich erforderliche Pause automatisch abziehen. */
  autoDeductMissingBreak: boolean
  /** Rundung erfasster Zeiten in Minuten (0 = keine Rundung). */
  roundingMinutes: number
  /** Laufende Erfassung nach Inaktivität automatisch pausieren (0 = aus). */
  idleTimeoutMinutes: number

  /* ------------------------------------------------- Ergonomie (40-15-5) */
  /** Bewegungserinnerungen aktiviert. */
  ergonomicsEnabled: boolean
  /** Dauer der Sitzphase in Minuten. */
  ergonomicsSitMinutes: number
  /** Dauer der Stehphase in Minuten. */
  ergonomicsStandMinutes: number
  /** Dauer der Bewegungsphase in Minuten. */
  ergonomicsMoveMinutes: number
  /** Zyklus während laufender Pausen anhalten. */
  ergonomicsPauseOnBreak: boolean
  /** Systembenachrichtigung beim Phasenwechsel anzeigen. */
  ergonomicsSystemNotification: boolean
  /** Signalton beim Phasenwechsel abspielen. */
  ergonomicsSound: boolean

  /* -------------------------------------------------------------- Kalender */
  /** Erste dargestellte Stunde im Kalender (0–23). */
  calendarStartHour: number
  /** Letzte dargestellte Stunde im Kalender (1–24). */
  calendarEndHour: number
  /** Raster der Kalenderzeilen in Minuten (5/10/15/30/60). */
  calendarSlotMinutes: number
  /** Hinweis anzeigen, wenn eine Buchung außerhalb der Arbeitszeit liegt. */
  warnBookingOutsideWorkingHours: boolean
  /** Hinweis anzeigen, wenn sich Buchungen überschneiden. */
  warnBookingOverlap: boolean

  /* ---------------------------------------------------------------- Export */
  /** Trennzeichen für CSV-Dateien. */
  csvDelimiter: ';' | ',' | '\t'
  /** Dezimaltrennzeichen für Zahlenwerte im Export. */
  csvDecimalSeparator: ',' | '.'
  /** Dauerformat im Export. */
  exportDurationFormat: 'hhmm' | 'decimal'
  /** Firmenname/Kopfzeile für PDF-Berichte. */
  reportTitle: string
  /** Name der Mitarbeiterin/des Mitarbeiters für Berichte. */
  employeeName: string

  /* ------------------------------------------------------------ Darstellung */
  themeMode: ThemeMode
  themeContrast: ThemeContrast
  /** Aktive Woche beginnt am … (1 = Montag, 7 = Sonntag). */
  weekStartsOn: number
  /** Startseite beim Öffnen der App. */
  startPage: 'tracker' | 'entries' | 'calendar' | 'reports' | 'settings'
}

/** Persistiertes Datenmodell (eine JSON-Datei im Benutzerprofil). */
export interface AppData {
  version: number
  settings: Settings
  workEntries: WorkEntry[]
  bookings: Booking[]
  templates: BookingTemplate[]
}

/* -------------------------------------------------------------------------- */
/*                          Auswertungen und Hinweise                          */
/* -------------------------------------------------------------------------- */

export type ComplianceSeverity = 'info' | 'warning' | 'error' | 'success'

/** Ein Hinweis der Regelprüfung (Arbeitszeitgesetz). */
export interface ComplianceIssue {
  id: string
  severity: ComplianceSeverity
  title: string
  detail: string
  /** Fundstelle im Arbeitszeitgesetz, z. B. "§ 4 ArbZG". */
  reference?: string
  /** Betroffener Kalendertag `YYYY-MM-DD`, sofern zuordenbar. */
  date?: string
}

/** Tagesauswertung einer oder mehrerer Arbeitszeiterfassungen. */
export interface DaySummary {
  date: string
  /** Bruttoanwesenheit in Minuten (Ende − Beginn über alle Erfassungen). */
  grossMinutes: number
  /** Erfasste Pausenzeit in Minuten. */
  breakMinutes: number
  /** Anrechenbare Pausenzeit (nur Abschnitte ≥ Mindestlänge). */
  countedBreakMinutes: number
  /** Nettoarbeitszeit in Minuten (brutto − Pausen − ggf. automatischer Abzug). */
  netMinutes: number
  /** Automatisch abgezogene Pausenminuten. */
  autoDeductedMinutes: number
  /** Gesetzlich erforderliche Pause in Minuten. */
  requiredBreakMinutes: number
  /** Sollarbeitszeit des Tages in Minuten. */
  targetMinutes: number
  /** Saldo (netto − soll). */
  balanceMinutes: number
  /** Frühester Beginn, `null` wenn keine Erfassung existiert. */
  firstStart: string | null
  /** Spätestes Ende, `null` wenn noch laufend oder keine Erfassung. */
  lastEnd: string | null
  /** Mindestens eine Erfassung läuft noch. */
  running: boolean
  entryIds: string[]
  /** Gebuchte Projektzeit in Minuten. */
  bookedMinutes: number
  issues: ComplianceIssue[]
}

/** Zustand des laufenden 40-15-5-Zyklus. */
export type ErgonomicsPhase = 'sit' | 'stand' | 'move'

export interface ErgonomicsState {
  phase: ErgonomicsPhase
  /** Verbleibende Sekunden der aktuellen Phase. */
  remainingSeconds: number
  /** Gesamtdauer der aktuellen Phase in Sekunden. */
  phaseSeconds: number
  running: boolean
  completedCycles: number
}

/* -------------------------------------------------------------------------- */
/*                                  IPC-API                                    */
/* -------------------------------------------------------------------------- */

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export type ExportDataset = 'workEntries' | 'bookings' | 'both'

export interface ExportRequest {
  format: ExportFormat
  dataset: ExportDataset
  /** Startdatum `YYYY-MM-DD` (inklusive). */
  from: string
  /** Enddatum `YYYY-MM-DD` (inklusive). */
  to: string
  /** Zusammenfassung je Tag beilegen. */
  includeSummary: boolean
}

export interface ExportResult {
  ok: boolean
  /** Pfad der geschriebenen Datei; `undefined`, wenn abgebrochen. */
  filePath?: string
  canceled?: boolean
  error?: string
}

export interface ImportResult {
  ok: boolean
  canceled?: boolean
  error?: string
  fileName?: string
  /** Rohinhalt der CSV-Datei. */
  content?: string
}

export interface NotificationRequest {
  title: string
  body: string
  silent?: boolean
}
