import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Switch,
  Textarea,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { AddRegular, DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { requiredBreakMinutes } from '@shared/arbzg'
import { WORK_KIND_LABELS } from '@shared/defaults'
import { createId } from '@shared/id'
import {
  combineDateAndTime,
  formatDuration,
  formatTime,
  minutesBetween,
  toLocalIso,
  todayKey
} from '@shared/time'
import type { BreakInterval, WorkEntry, WorkKind } from '@shared/types'
import { DateField, TimeField } from '../components/fields'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  surface: { maxWidth: '640px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end'
  },
  breakRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end'
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  }
})

interface DraftBreak {
  id: string
  from: string
  to: string
}

export interface WorkEntryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Vorhandener Eintrag zum Bearbeiten; leer = neuer Eintrag. */
  entry?: WorkEntry | null
  /** Vorbelegtes Datum für neue Einträge. */
  defaultDate?: string
}

function isoAt(dateKey: string, time: string, notBefore?: Date | null): string | null {
  const date = combineDateAndTime(dateKey, time)
  if (!date) return null
  if (notBefore && date.getTime() < notBefore.getTime()) date.setDate(date.getDate() + 1)
  return toLocalIso(date)
}

export default function WorkEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate
}: WorkEntryDialogProps): JSX.Element {
  const styles = useStyles()
  const settings = useAppStore((state) => state.settings)
  const addWorkEntry = useAppStore((state) => state.addWorkEntry)
  const updateWorkEntry = useAppStore((state) => state.updateWorkEntry)
  const deleteWorkEntry = useAppStore((state) => state.deleteWorkEntry)

  const [dateKey, setDateKey] = useState(defaultDate ?? todayKey())
  const [start, setStart] = useState(settings.workdayStart)
  const [end, setEnd] = useState(settings.workdayEnd)
  const [stillRunning, setStillRunning] = useState(false)
  const [kind, setKind] = useState<WorkKind>('office')
  const [note, setNote] = useState('')
  const [breaks, setBreaks] = useState<DraftBreak[]>([])

  useEffect(() => {
    if (!open) return
    if (entry) {
      setDateKey(entry.date)
      setStart(formatTime(entry.start))
      setEnd(entry.end ? formatTime(entry.end) : settings.workdayEnd)
      setStillRunning(entry.end === null)
      setKind(entry.kind)
      setNote(entry.note ?? '')
      setBreaks(
        entry.breaks.map((pause) => ({
          id: pause.id,
          from: formatTime(pause.start),
          to: pause.end ? formatTime(pause.end) : ''
        }))
      )
    } else {
      setDateKey(defaultDate ?? todayKey())
      setStart(settings.workdayStart)
      setEnd(settings.workdayEnd)
      setStillRunning(false)
      setKind('office')
      setNote('')
      setBreaks([])
    }
  }, [open, entry, defaultDate, settings.workdayStart, settings.workdayEnd])

  const preview = useMemo(() => {
    const startIso = isoAt(dateKey, start)
    if (!startIso) return null
    const startDate = new Date(startIso)
    const endIso = stillRunning ? null : isoAt(dateKey, end, startDate)
    const grossMinutes = endIso ? minutesBetween(startIso, endIso) : 0

    let breakMinutes = 0
    let invalidBreak = false
    let outsideBreak = false
    for (const pause of breaks) {
      const fromIso = isoAt(dateKey, pause.from, startDate)
      const toIso = pause.to ? isoAt(dateKey, pause.to, fromIso ? new Date(fromIso) : startDate) : null
      if (!fromIso || !toIso) {
        invalidBreak = true
        continue
      }
      breakMinutes += minutesBetween(fromIso, toIso)
      if (endIso && (fromIso < startIso || toIso > endIso)) outsideBreak = true
    }

    const netMinutes = Math.max(0, grossMinutes - breakMinutes)
    return {
      startIso,
      endIso,
      grossMinutes,
      breakMinutes,
      netMinutes,
      invalidBreak,
      outsideBreak,
      required: requiredBreakMinutes(netMinutes, settings),
      overnight: Boolean(endIso && new Date(endIso).getDate() !== startDate.getDate())
    }
  }, [dateKey, start, end, stillRunning, breaks, settings])

  const canSave = Boolean(
    preview && preview.startIso && (stillRunning || (preview.endIso && preview.grossMinutes > 0))
  )

  const handleSave = (): void => {
    if (!preview?.startIso) return
    const startDate = new Date(preview.startIso)
    const intervals: BreakInterval[] = []
    for (const pause of breaks) {
      const fromIso = isoAt(dateKey, pause.from, startDate)
      if (!fromIso) continue
      const toIso = pause.to ? isoAt(dateKey, pause.to, new Date(fromIso)) : null
      intervals.push({ id: pause.id, start: fromIso, end: toIso })
    }

    const payload = {
      date: dateKey,
      start: preview.startIso,
      end: stillRunning ? null : preview.endIso,
      breaks: intervals,
      kind,
      note: note.trim() || undefined
    }

    if (entry) updateWorkEntry(entry.id, payload)
    else addWorkEntry(payload)
    onOpenChange(false)
  }

  const handleDelete = (): void => {
    if (!entry) return
    deleteWorkEntry(entry.id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(_event, data) => onOpenChange(data.open)}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Schließen"
                onClick={() => onOpenChange(false)}
              />
            }
          >
            {entry ? 'Arbeitszeit bearbeiten' : 'Arbeitszeit nachtragen'}
          </DialogTitle>

          <DialogContent className={styles.column}>
            <div className={styles.grid}>
              <DateField
                label="Datum"
                required
                value={dateKey}
                onChange={setDateKey}
                firstDayOfWeek={settings.weekStartsOn % 7}
              />
              <TimeField
                label="Beginn"
                required
                dateKey={dateKey}
                value={start}
                onChange={setStart}
                increment={5}
              />
              <TimeField
                label="Ende"
                dateKey={dateKey}
                value={end}
                onChange={setEnd}
                increment={5}
                disabled={stillRunning}
              />
            </div>

            <div className={styles.grid}>
              <Field label="Art der Tätigkeit">
                <Dropdown
                  value={WORK_KIND_LABELS[kind]}
                  selectedOptions={[kind]}
                  onOptionSelect={(_event, data) => setKind(data.optionValue as WorkKind)}
                >
                  {Object.entries(WORK_KIND_LABELS).map(([value, label]) => (
                    <Option key={value} value={value} text={label}>
                      {label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Status">
                <Switch
                  checked={stillRunning}
                  label={stillRunning ? 'Erfassung läuft' : 'Abgeschlossen'}
                  onChange={(_event, data) => setStillRunning(data.checked)}
                />
              </Field>
              <Field label="Dauer (netto)">
                <Tooltip
                  content={`Brutto ${formatDuration(preview?.grossMinutes ?? 0)} abzüglich ${Math.round(
                    preview?.breakMinutes ?? 0
                  )} Pausenminuten`}
                  relationship="description"
                >
                  <Button appearance="transparent" disabled>
                    {formatDuration(preview?.netMinutes ?? 0)}
                  </Button>
                </Tooltip>
              </Field>
            </div>

            <Divider>Pausen</Divider>

            {breaks.map((pause, index) => (
              <div className={styles.breakRow} key={pause.id}>
                <TimeField
                  label={`Pause ${index + 1} von`}
                  dateKey={dateKey}
                  value={pause.from}
                  increment={5}
                  onChange={(value) =>
                    setBreaks((current) =>
                      current.map((item) => (item.id === pause.id ? { ...item, from: value } : item))
                    )
                  }
                />
                <TimeField
                  label="bis"
                  dateKey={dateKey}
                  value={pause.to}
                  increment={5}
                  onChange={(value) =>
                    setBreaks((current) =>
                      current.map((item) => (item.id === pause.id ? { ...item, to: value } : item))
                    )
                  }
                />
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  aria-label="Pause entfernen"
                  onClick={() =>
                    setBreaks((current) => current.filter((item) => item.id !== pause.id))
                  }
                />
              </div>
            ))}

            <Button
              appearance="secondary"
              icon={<AddRegular />}
              onClick={() =>
                setBreaks((current) => [
                  ...current,
                  { id: createId(), from: '12:00', to: '12:30' }
                ])
              }
            >
              Pause hinzufügen
            </Button>

            <Field label="Notiz">
              <Textarea
                value={note}
                resize="vertical"
                placeholder="Optionale Bemerkung zur Arbeitszeit"
                onChange={(_event, data) => setNote(data.value)}
              />
            </Field>

            {preview?.overnight ? (
              <MessageBar intent="info">
                <MessageBarBody>
                  Die Erfassung endet am Folgetag – das Ende wird entsprechend gespeichert.
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {preview?.invalidBreak ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  Mindestens eine Pause ist unvollständig und wird ohne Ende gespeichert.
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {preview?.outsideBreak ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  Mindestens eine Pause liegt außerhalb des Arbeitszeitraums.
                </MessageBarBody>
              </MessageBar>
            ) : null}

            {preview && preview.required > preview.breakMinutes ? (
              <MessageBar intent="warning">
                <MessageBarBody>
                  § 4 ArbZG: Bei {formatDuration(preview.netMinutes)} Arbeitszeit sind{' '}
                  {preview.required} Minuten Ruhepause vorgeschrieben. Erfasst sind{' '}
                  {Math.round(preview.breakMinutes)} Minuten.
                </MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>

          <DialogActions>
            {entry ? (
              <Button appearance="subtle" icon={<DeleteRegular />} onClick={handleDelete}>
                Löschen
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button appearance="primary" disabled={!canSave} onClick={handleSave}>
              Speichern
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
