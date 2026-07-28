/**
 * Lokale Datenhaltung.
 *
 * Sämtliche Daten liegen in einer einzigen JSON-Datei im Benutzerprofil
 * (`app.getPath('userData')`). Es findet keinerlei Netzwerkkommunikation statt.
 */

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DATA_VERSION, DEFAULT_SETTINGS, EMPTY_DATA } from '../shared/defaults'
import type { AppData, Settings } from '../shared/types'

const FILE_NAME = 'zeitwerk-data.json'

let cache: AppData | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function dataFilePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function sanitizeSettings(input: unknown): Settings {
  const raw = (input ?? {}) as Partial<Settings>
  const merged: Settings = { ...DEFAULT_SETTINGS, ...raw }

  const numberKeys: (keyof Settings)[] = [
    'dailyTargetMinutes',
    'weeklyTargetMinutes',
    'maxDailyWorkMinutes',
    'maxExtendedDailyWorkMinutes',
    'averagingPeriodWeeks',
    'breakThreshold1Minutes',
    'breakDuration1Minutes',
    'breakThreshold2Minutes',
    'breakDuration2Minutes',
    'minBreakBlockMinutes',
    'maxWorkWithoutBreakMinutes',
    'minRestPeriodMinutes',
    'warningLeadMinutes',
    'roundingMinutes',
    'idleTimeoutMinutes',
    'ergonomicsSitMinutes',
    'ergonomicsStandMinutes',
    'ergonomicsMoveMinutes',
    'calendarStartHour',
    'calendarEndHour',
    'calendarSlotMinutes',
    'weekStartsOn'
  ]
  const writable = merged as unknown as Record<string, unknown>
  for (const key of numberKeys) {
    const value = Number(merged[key])
    writable[key] = Number.isFinite(value) ? value : DEFAULT_SETTINGS[key]
  }

  if (!Array.isArray(merged.workdays) || merged.workdays.length === 0) {
    merged.workdays = [...DEFAULT_SETTINGS.workdays]
  } else {
    merged.workdays = [...new Set(merged.workdays.map(Number).filter((day) => day >= 1 && day <= 7))]
    if (merged.workdays.length === 0) merged.workdays = [...DEFAULT_SETTINGS.workdays]
  }

  if (merged.calendarEndHour <= merged.calendarStartHour) {
    merged.calendarStartHour = DEFAULT_SETTINGS.calendarStartHour
    merged.calendarEndHour = DEFAULT_SETTINGS.calendarEndHour
  }

  return merged
}

function sanitizeData(input: unknown): AppData {
  const raw = (input ?? {}) as Partial<AppData>
  return {
    version: DATA_VERSION,
    settings: sanitizeSettings(raw.settings),
    workEntries: Array.isArray(raw.workEntries) ? raw.workEntries : [],
    bookings: Array.isArray(raw.bookings) ? raw.bookings : [],
    templates: Array.isArray(raw.templates) ? raw.templates : []
  }
}

export async function loadData(): Promise<AppData> {
  if (cache) return cache
  const filePath = dataFilePath()
  if (!existsSync(filePath)) {
    cache = { ...EMPTY_DATA, settings: { ...DEFAULT_SETTINGS } }
    return cache
  }
  try {
    const content = await readFile(filePath, 'utf-8')
    cache = sanitizeData(JSON.parse(content))
  } catch (error) {
    // Beschädigte Datei sichern, damit keine Daten verloren gehen.
    const backup = `${filePath}.${Date.now()}.corrupt`
    try {
      await copyFile(filePath, backup)
    } catch {
      /* Sicherung ist optional */
    }
    console.error(`Datendatei konnte nicht gelesen werden, Sicherung unter ${backup}`, error)
    cache = { ...EMPTY_DATA, settings: { ...DEFAULT_SETTINGS } }
  }
  return cache
}

/** Schreibt die Daten atomar (temporäre Datei + Umbenennen), serialisiert über eine Queue. */
export async function saveData(data: AppData): Promise<AppData> {
  const sanitized = sanitizeData(data)
  cache = sanitized
  const filePath = dataFilePath()

  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    await writeFile(temporary, JSON.stringify(sanitized, null, 2), 'utf-8')
    await rename(temporary, filePath)
  })
  await writeQueue
  return sanitized
}

export async function flushPendingWrites(): Promise<void> {
  await writeQueue
}
