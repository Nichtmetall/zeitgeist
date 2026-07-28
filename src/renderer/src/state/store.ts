/**
 * Anwendungszustand.
 *
 * Der Zustand spiegelt exakt die persistierte JSON-Datei wider. Jede Mutation
 * plant automatisch ein Speichern im Hauptprozess ein (leicht verzögert, damit
 * schnelle Folgeänderungen zusammengefasst werden).
 */

import { create } from 'zustand'
import { DATA_VERSION, DEFAULT_SETTINGS } from '@shared/defaults'
import { createId } from '@shared/id'
import { toDateKey, toLocalIso } from '@shared/time'
import type {
  AppData,
  Booking,
  BookingTemplate,
  BreakInterval,
  Settings,
  WorkEntry,
  WorkKind
} from '@shared/types'

const PERSIST_DELAY_MS = 350

export interface NewWorkEntry {
  date: string
  start: string
  end: string | null
  breaks: BreakInterval[]
  kind: WorkKind
  note?: string
}

export interface NewBooking {
  date: string
  start: string
  end: string
  project: string
  description: string
  color: Booking['color']
  billable: boolean
  templateId?: string
}

export interface AppState {
  loaded: boolean
  saving: boolean
  settings: Settings
  workEntries: WorkEntry[]
  bookings: Booking[]
  templates: BookingTemplate[]

  load: () => Promise<void>
  replaceAll: (data: Partial<AppData>) => void

  updateSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void

  startWork: (kind?: WorkKind) => void
  stopWork: () => void
  toggleBreak: () => void

  addWorkEntry: (entry: NewWorkEntry) => WorkEntry
  updateWorkEntry: (id: string, patch: Partial<NewWorkEntry>) => void
  deleteWorkEntry: (id: string) => void
  deleteWorkEntries: (ids: string[]) => void

  addBooking: (booking: NewBooking) => Booking
  updateBooking: (id: string, patch: Partial<NewBooking>) => void
  deleteBooking: (id: string) => void
  deleteBookings: (ids: string[]) => void

  addTemplate: (template: Omit<BookingTemplate, 'id' | 'createdAt'>) => BookingTemplate
  updateTemplate: (id: string, patch: Partial<Omit<BookingTemplate, 'id' | 'createdAt'>>) => void
  deleteTemplate: (id: string) => void

  importEntries: (workEntries: WorkEntry[], bookings: Booking[]) => void
  clearAllData: () => void
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function writeNow(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void
): Promise<unknown> {
  const state = get()
  if (!state.loaded) return Promise.resolve()
  set({ saving: true })
  return window.zeitwerk
    .saveData({
      version: DATA_VERSION,
      settings: state.settings,
      workEntries: state.workEntries,
      bookings: state.bookings,
      templates: state.templates
    })
    .catch((error: unknown) => {
      console.error('Speichern fehlgeschlagen', error)
    })
    .finally(() => set({ saving: false }))
}

function schedulePersist(get: () => AppState, set: (partial: Partial<AppState>) => void): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void writeNow(get, set)
  }, PERSIST_DELAY_MS)
}

function nowIso(): string {
  return toLocalIso(new Date())
}

function sortByStart<T extends { start: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.start.localeCompare(b.start))
}

export const useAppStore = create<AppState>()((set, get) => {
  const persist = (): void => schedulePersist(get, set)

  return {
    loaded: false,
    saving: false,
    settings: DEFAULT_SETTINGS,
    workEntries: [],
    bookings: [],
    templates: [],

    load: async () => {
      const data = await window.zeitwerk.loadData()
      set({
        loaded: true,
        settings: { ...DEFAULT_SETTINGS, ...data.settings },
        workEntries: sortByStart(data.workEntries ?? []),
        bookings: sortByStart(data.bookings ?? []),
        templates: data.templates ?? []
      })
    },

    replaceAll: (data) => {
      set({
        settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
        workEntries: sortByStart(data.workEntries ?? []),
        bookings: sortByStart(data.bookings ?? []),
        templates: data.templates ?? []
      })
      persist()
    },

    updateSettings: (patch) => {
      set({ settings: { ...get().settings, ...patch } })
      persist()
    },

    resetSettings: () => {
      set({ settings: { ...DEFAULT_SETTINGS } })
      persist()
    },

    /* ------------------------------ Zeiterfassung ------------------------- */

    startWork: (kind) => {
      const state = get()
      if (state.workEntries.some((entry) => entry.end === null)) return
      const timestamp = nowIso()
      const entry: WorkEntry = {
        id: createId(),
        date: toDateKey(new Date()),
        start: timestamp,
        end: null,
        breaks: [],
        kind: kind ?? 'office',
        createdAt: timestamp,
        updatedAt: timestamp
      }
      set({ workEntries: sortByStart([...state.workEntries, entry]) })
      persist()
    },

    stopWork: () => {
      const timestamp = nowIso()
      set({
        workEntries: get().workEntries.map((entry) => {
          if (entry.end !== null) return entry
          return {
            ...entry,
            end: timestamp,
            breaks: entry.breaks.map((pause) =>
              pause.end === null ? { ...pause, end: timestamp } : pause
            ),
            updatedAt: timestamp
          }
        })
      })
      persist()
    },

    toggleBreak: () => {
      const timestamp = nowIso()
      const state = get()
      const running = state.workEntries.find((entry) => entry.end === null)
      if (!running) return

      const openBreak = running.breaks.find((pause) => pause.end === null)
      const breaks = openBreak
        ? running.breaks.map((pause) =>
            pause.id === openBreak.id ? { ...pause, end: timestamp } : pause
          )
        : [...running.breaks, { id: createId(), start: timestamp, end: null }]

      set({
        workEntries: state.workEntries.map((entry) =>
          entry.id === running.id ? { ...entry, breaks, updatedAt: timestamp } : entry
        )
      })
      persist()
    },

    addWorkEntry: (input) => {
      const timestamp = nowIso()
      const entry: WorkEntry = {
        id: createId(),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      set({ workEntries: sortByStart([...get().workEntries, entry]) })
      persist()
      return entry
    },

    updateWorkEntry: (id, patch) => {
      const timestamp = nowIso()
      set({
        workEntries: sortByStart(
          get().workEntries.map((entry) =>
            entry.id === id ? { ...entry, ...patch, updatedAt: timestamp } : entry
          )
        )
      })
      persist()
    },

    deleteWorkEntry: (id) => {
      set({ workEntries: get().workEntries.filter((entry) => entry.id !== id) })
      persist()
    },

    deleteWorkEntries: (ids) => {
      const remove = new Set(ids)
      set({ workEntries: get().workEntries.filter((entry) => !remove.has(entry.id)) })
      persist()
    },

    /* ------------------------------- Buchungen ---------------------------- */

    addBooking: (input) => {
      const timestamp = nowIso()
      const booking: Booking = {
        id: createId(),
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      set({ bookings: sortByStart([...get().bookings, booking]) })
      persist()
      return booking
    },

    updateBooking: (id, patch) => {
      const timestamp = nowIso()
      set({
        bookings: sortByStart(
          get().bookings.map((booking) =>
            booking.id === id ? { ...booking, ...patch, updatedAt: timestamp } : booking
          )
        )
      })
      persist()
    },

    deleteBooking: (id) => {
      set({ bookings: get().bookings.filter((booking) => booking.id !== id) })
      persist()
    },

    deleteBookings: (ids) => {
      const remove = new Set(ids)
      set({ bookings: get().bookings.filter((booking) => !remove.has(booking.id)) })
      persist()
    },

    /* -------------------------------- Vorlagen ---------------------------- */

    addTemplate: (input) => {
      const template: BookingTemplate = { id: createId(), createdAt: nowIso(), ...input }
      set({ templates: [...get().templates, template] })
      persist()
      return template
    },

    updateTemplate: (id, patch) => {
      set({
        templates: get().templates.map((template) =>
          template.id === id ? { ...template, ...patch } : template
        )
      })
      persist()
    },

    deleteTemplate: (id) => {
      set({ templates: get().templates.filter((template) => template.id !== id) })
      persist()
    },

    /* --------------------------------- Import ----------------------------- */

    importEntries: (workEntries, bookings) => {
      set({
        workEntries: sortByStart([...get().workEntries, ...workEntries]),
        bookings: sortByStart([...get().bookings, ...bookings])
      })
      persist()
    },

    clearAllData: () => {
      set({ workEntries: [], bookings: [] })
      persist()
    }
  }
})

/**
 * Schreibt eine noch ausstehende Änderung sofort weg – wird vor dem Schließen
 * des Fensters aufgerufen, damit die letzte Eingabe nicht verloren geht.
 */
export async function flushPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await writeNow(useAppStore.getState, (partial) => useAppStore.setState(partial))
}

/** Aktuell laufende Erfassung, falls vorhanden. */
export function selectRunningEntry(state: AppState): WorkEntry | undefined {
  return state.workEntries.find((entry) => entry.end === null)
}

/** Laufende Pause der aktiven Erfassung, falls vorhanden. */
export function selectRunningBreak(state: AppState): BreakInterval | undefined {
  return selectRunningEntry(state)?.breaks.find((pause) => pause.end === null)
}
