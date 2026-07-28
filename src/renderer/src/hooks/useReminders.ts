import { useEffect, useRef } from 'react'
import type { BreakGuidance } from '@shared/arbzg'
import type { BreakInterval, WorkEntry } from '@shared/types'
import {
  PHASE_ANNOUNCEMENT,
  PHASE_HINTS,
  phaseDurationMinutes,
  useErgonomicsStore
} from '../state/ergonomics'
import { useAppStore } from '../state/store'
import { useNotify } from '../components/notifications'

interface RemindersInput {
  guidance: BreakGuidance
  runningEntry: WorkEntry | undefined
  runningBreak: BreakInterval | undefined
}

/**
 * Bündelt alle wiederkehrenden Hinweise:
 *  - Bewegungserinnerungen nach der 40-15-5-Methode
 *  - Hinweise zur Einhaltung der gesetzlichen Pausenzeiten (§ 4 ArbZG)
 */
export function useReminders({ guidance, runningEntry, runningBreak }: RemindersInput): void {
  const settings = useAppStore((state) => state.settings)
  const notify = useNotify()
  const lastBreakStatus = useRef<string>('idle')
  const idleNotified = useRef(false)

  const ergonomicsActive =
    settings.ergonomicsEnabled &&
    Boolean(runningEntry) &&
    !(settings.ergonomicsPauseOnBreak && runningBreak)

  /* ------------------------- 40-15-5-Bewegungszyklus ---------------------- */
  useEffect(() => {
    useErgonomicsStore.getState().setRunning(ergonomicsActive, settings)
  }, [ergonomicsActive, settings])

  useEffect(() => {
    if (!ergonomicsActive) return undefined
    const timer = setInterval(() => {
      const change = useErgonomicsStore.getState().tick(settings)
      if (!change) return
      notify({
        title: PHASE_ANNOUNCEMENT[change.to],
        body: `${PHASE_HINTS[change.to]} (${phaseDurationMinutes(change.to, settings)} Minuten)`,
        intent: change.to === 'sit' ? 'info' : 'warning',
        timeout: 12000,
        system: settings.ergonomicsSystemNotification
      })
      if (settings.ergonomicsSound) playChime()
    }, 1000)
    return () => clearInterval(timer)
  }, [ergonomicsActive, settings, notify])

  /* ---------------------------- Inaktivität ------------------------------ */
  useEffect(() => {
    const timeout = settings.idleTimeoutMinutes
    if (!runningEntry || timeout <= 0) {
      idleNotified.current = false
      return undefined
    }
    const timer = setInterval(() => {
      void window.zeitwerk.idleSeconds().then((seconds) => {
        if (seconds >= timeout * 60) {
          if (idleNotified.current) return
          idleNotified.current = true
          notify({
            title: 'Seit einer Weile keine Eingabe',
            body: `Die Erfassung läuft noch, seit ${Math.round(
              seconds / 60
            )} Minuten gab es aber keine Eingabe. Pause erfassen oder Erfassung beenden?`,
            intent: 'warning',
            timeout: 15000,
            system: true
          })
        } else {
          idleNotified.current = false
        }
      })
    }, 30000)
    return () => clearInterval(timer)
  }, [runningEntry, settings.idleTimeoutMinutes, notify])

  /* --------------------------- Pausenhinweise ---------------------------- */
  useEffect(() => {
    const status = guidance.status
    if (status === lastBreakStatus.current) return
    const previous = lastBreakStatus.current
    lastBreakStatus.current = status

    // Beim ersten Rendern keine Meldung erzeugen.
    if (previous === 'idle' && status === 'ok') return
    if (runningBreak) return

    if (status === 'due_soon') {
      notify({
        title: 'Pause bald fällig',
        body: guidance.message,
        intent: 'warning',
        timeout: 10000,
        system: true
      })
    } else if (status === 'due') {
      notify({
        title: 'Gesetzliche Ruhepause offen',
        body: guidance.message,
        intent: 'warning',
        timeout: 12000,
        system: true
      })
    } else if (status === 'violated') {
      notify({
        title: 'Pausenzeit überschritten',
        body: guidance.message,
        intent: 'error',
        timeout: 15000,
        system: true
      })
    }
  }, [guidance, runningBreak, notify])
}

/** Kurzer Signalton über die Web-Audio-API – ohne externe Audiodateien. */
function playChime(): void {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.65)
    oscillator.onended = () => void context.close()
  } catch {
    /* Ton ist optional */
  }
}
