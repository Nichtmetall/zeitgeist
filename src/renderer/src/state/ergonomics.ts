/**
 * 40-15-5-Methode: 40 Minuten dynamisches Sitzen, 15 Minuten Stehen und
 * 5 Minuten Bewegung – die von der Deutschen Gesetzlichen Unfallversicherung
 * empfohlene Aufteilung eines Arbeitsstundenblocks.
 *
 * Der Zyklus läuft nur während laufender Arbeitszeiterfassung und kann in den
 * Einstellungen komplett deaktiviert oder in seinen Zeiten angepasst werden.
 */

import { create } from 'zustand'
import type { ErgonomicsPhase, Settings } from '@shared/types'

const PHASE_ORDER: ErgonomicsPhase[] = ['sit', 'stand', 'move']

export const PHASE_LABELS: Record<ErgonomicsPhase, string> = {
  sit: 'Sitzen',
  stand: 'Stehen',
  move: 'Bewegen'
}

export const PHASE_HINTS: Record<ErgonomicsPhase, string> = {
  sit: 'Dynamisch sitzen: Haltung häufiger wechseln, Rückenlehne aktiv nutzen.',
  stand: 'Aufstehen: Tisch hochfahren und im Stehen weiterarbeiten.',
  move: 'Bewegen: aufstehen, ein paar Schritte gehen, Schultern und Augen lockern.'
}

export const PHASE_ANNOUNCEMENT: Record<ErgonomicsPhase, string> = {
  sit: 'Wieder hinsetzen',
  stand: 'Bitte aufstehen',
  move: 'Zeit für Bewegung'
}

export interface PhaseChange {
  from: ErgonomicsPhase
  to: ErgonomicsPhase
  /** Vom Benutzer ausgelöst (Überspringen) statt durch Zeitablauf. */
  manual: boolean
}

export function phaseDurationMinutes(phase: ErgonomicsPhase, settings: Settings): number {
  switch (phase) {
    case 'sit':
      return Math.max(1, settings.ergonomicsSitMinutes)
    case 'stand':
      return Math.max(1, settings.ergonomicsStandMinutes)
    case 'move':
      return Math.max(1, settings.ergonomicsMoveMinutes)
    default:
      return 1
  }
}

export interface ErgonomicsStore {
  phase: ErgonomicsPhase
  /** Verbleibende Millisekunden der aktuellen Phase. */
  remainingMs: number
  /** Gesamtdauer der aktuellen Phase in Millisekunden. */
  totalMs: number
  running: boolean
  completedCycles: number
  /** Zeitpunkt des letzten Ticks, um Pausen des Timers korrekt zu verrechnen. */
  lastTickAt: number | null

  configure: (settings: Settings) => void
  setRunning: (running: boolean, settings: Settings) => void
  tick: (settings: Settings) => PhaseChange | null
  skip: (settings: Settings) => PhaseChange
  restartPhase: (settings: Settings) => void
  resetCycle: (settings: Settings) => void
}

function nextPhase(phase: ErgonomicsPhase): ErgonomicsPhase {
  const index = PHASE_ORDER.indexOf(phase)
  return PHASE_ORDER[(index + 1) % PHASE_ORDER.length]
}

export const useErgonomicsStore = create<ErgonomicsStore>()((set, get) => ({
  phase: 'sit',
  remainingMs: 40 * 60_000,
  totalMs: 40 * 60_000,
  running: false,
  completedCycles: 0,
  lastTickAt: null,

  configure: (settings) => {
    const total = phaseDurationMinutes(get().phase, settings) * 60_000
    set({ totalMs: total, remainingMs: Math.min(get().remainingMs, total) })
  },

  setRunning: (running, settings) => {
    if (running === get().running) return
    if (running) {
      set({ running: true, lastTickAt: Date.now() })
    } else {
      set({ running: false, lastTickAt: null })
    }
    get().configure(settings)
  },

  tick: (settings) => {
    const state = get()
    if (!state.running) return null
    const now = Date.now()
    const elapsed = state.lastTickAt === null ? 0 : now - state.lastTickAt
    const remaining = state.remainingMs - elapsed

    if (remaining > 0) {
      set({ remainingMs: remaining, lastTickAt: now })
      return null
    }

    const from = state.phase
    const to = nextPhase(from)
    set({
      phase: to,
      totalMs: phaseDurationMinutes(to, settings) * 60_000,
      remainingMs: phaseDurationMinutes(to, settings) * 60_000,
      lastTickAt: now,
      completedCycles: to === 'sit' ? state.completedCycles + 1 : state.completedCycles
    })
    return { from, to, manual: false }
  },

  skip: (settings) => {
    const state = get()
    const from = state.phase
    const to = nextPhase(from)
    set({
      phase: to,
      totalMs: phaseDurationMinutes(to, settings) * 60_000,
      remainingMs: phaseDurationMinutes(to, settings) * 60_000,
      lastTickAt: state.running ? Date.now() : null,
      completedCycles: to === 'sit' ? state.completedCycles + 1 : state.completedCycles
    })
    return { from, to, manual: true }
  },

  restartPhase: (settings) => {
    const total = phaseDurationMinutes(get().phase, settings) * 60_000
    set({ totalMs: total, remainingMs: total, lastTickAt: get().running ? Date.now() : null })
  },

  resetCycle: (settings) => {
    const total = phaseDurationMinutes('sit', settings) * 60_000
    set({
      phase: 'sit',
      totalMs: total,
      remainingMs: total,
      completedCycles: 0,
      lastTickAt: get().running ? Date.now() : null
    })
  }
}))
