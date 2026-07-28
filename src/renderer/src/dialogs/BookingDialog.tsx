import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Button,
  Combobox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  SpinButton,
  Switch,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { BookmarkRegular, DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { checkBooking } from '@shared/arbzg'
import { BOOKING_COLORS, BOOKING_COLOR_KEYS } from '@shared/defaults'
import {
  combineDateAndTime,
  formatDuration,
  formatTime,
  minutesBetween,
  toLocalIso,
  todayKey
} from '@shared/time'
import type { Booking, BookingColor } from '@shared/types'
import { DateField, TimeField } from '../components/fields'
import { useNotify } from '../components/notifications'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  surface: { maxWidth: '620px' },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end'
  },
  swatch: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    borderRadius: tokens.borderRadiusCircular,
    marginRight: tokens.spacingHorizontalS
  },
  optionRow: { display: 'flex', alignItems: 'center' }
})

export interface BookingDraft {
  date: string
  startTime: string
  endTime: string
  project?: string
  description?: string
  color?: BookingColor
  billable?: boolean
  templateId?: string
}

export interface BookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking?: Booking | null
  /** Vorbelegung, z. B. aus dem Ziehen im Kalender. */
  draft?: BookingDraft | null
}

export default function BookingDialog({
  open,
  onOpenChange,
  booking,
  draft
}: BookingDialogProps): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()

  const settings = useAppStore((state) => state.settings)
  const workEntries = useAppStore((state) => state.workEntries)
  const bookings = useAppStore((state) => state.bookings)
  const templates = useAppStore((state) => state.templates)
  const addBooking = useAppStore((state) => state.addBooking)
  const updateBooking = useAppStore((state) => state.updateBooking)
  const deleteBooking = useAppStore((state) => state.deleteBooking)
  const addTemplate = useAppStore((state) => state.addTemplate)

  const [dateKey, setDateKey] = useState(todayKey())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [project, setProject] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<BookingColor>('brand')
  const [billable, setBillable] = useState(true)
  const [templateId, setTemplateId] = useState<string | undefined>()

  const knownProjects = useMemo(() => {
    const set = new Set<string>()
    for (const item of bookings) if (item.project) set.add(item.project)
    for (const item of templates) if (item.project) set.add(item.project)
    return [...set].sort((a, b) => a.localeCompare(b, 'de'))
  }, [bookings, templates])

  useEffect(() => {
    if (!open) return
    if (booking) {
      setDateKey(booking.date)
      setStartTime(formatTime(booking.start))
      setEndTime(formatTime(booking.end))
      setProject(booking.project)
      setDescription(booking.description)
      setColor(booking.color)
      setBillable(booking.billable)
      setTemplateId(booking.templateId)
      return
    }
    setDateKey(draft?.date ?? todayKey())
    setStartTime(draft?.startTime ?? '09:00')
    setEndTime(draft?.endTime ?? '10:00')
    setProject(draft?.project ?? '')
    setDescription(draft?.description ?? '')
    setColor(draft?.color ?? 'brand')
    setBillable(draft?.billable ?? true)
    setTemplateId(draft?.templateId)
  }, [open, booking, draft])

  const times = useMemo(() => {
    const start = combineDateAndTime(dateKey, startTime)
    let end = combineDateAndTime(dateKey, endTime)
    if (start && end && end.getTime() <= start.getTime()) {
      end = new Date(end.getTime() + 24 * 3600 * 1000)
    }
    return {
      start,
      end,
      minutes: start && end ? minutesBetween(start, end) : 0
    }
  }, [dateKey, startTime, endTime])

  const warnings = useMemo(() => {
    if (!times.start || !times.end || times.minutes <= 0) return []
    return checkBooking(
      {
        id: booking?.id ?? 'draft',
        date: dateKey,
        start: toLocalIso(times.start),
        end: toLocalIso(times.end),
        project
      },
      { settings, workEntries, bookings }
    )
  }, [times, dateKey, project, settings, workEntries, bookings, booking])

  const applyTemplate = (id: string): void => {
    const template = templates.find((item) => item.id === id)
    if (!template) return
    setTemplateId(template.id)
    setProject(template.project)
    setDescription(template.description)
    setColor(template.color)
    setBillable(template.billable)
    const start = combineDateAndTime(dateKey, startTime)
    if (start) {
      const end = new Date(start.getTime() + template.defaultDurationMinutes * 60000)
      setEndTime(formatTime(end))
    }
  }

  const setDurationMinutes = (minutes: number): void => {
    const start = combineDateAndTime(dateKey, startTime)
    if (!start || minutes <= 0) return
    setEndTime(formatTime(new Date(start.getTime() + minutes * 60000)))
  }

  const canSave = Boolean(times.start && times.end && times.minutes > 0)

  const handleSave = (): void => {
    if (!times.start || !times.end) return
    const payload = {
      date: dateKey,
      start: toLocalIso(times.start),
      end: toLocalIso(times.end),
      project: project.trim(),
      description: description.trim(),
      color,
      billable,
      templateId
    }
    if (booking) updateBooking(booking.id, payload)
    else addBooking(payload)
    onOpenChange(false)
  }

  const handleSaveAsTemplate = (): void => {
    if (!project.trim() && !description.trim()) {
      notify({
        title: 'Vorlage benötigt Inhalt',
        body: 'Gib mindestens ein Projekt oder eine Beschreibung an.',
        intent: 'warning'
      })
      return
    }
    addTemplate({
      name: project.trim() || description.trim().slice(0, 40),
      project: project.trim(),
      description: description.trim(),
      defaultDurationMinutes: Math.max(5, Math.round(times.minutes)),
      color,
      billable
    })
    notify({ title: 'Vorlage gespeichert', intent: 'success' })
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
            {booking ? 'Zeitbuchung bearbeiten' : 'Zeitbuchung anlegen'}
          </DialogTitle>

          <DialogContent className={styles.column}>
            {templates.length > 0 ? (
              <Field
                label="Vorlage anwenden"
                hint="Übernimmt Projekt, Beschreibung, Farbe und Standarddauer."
              >
                <Dropdown
                  placeholder="Vorlage auswählen"
                  value={templates.find((item) => item.id === templateId)?.name ?? ''}
                  selectedOptions={templateId ? [templateId] : []}
                  onOptionSelect={(_event, data) =>
                    data.optionValue ? applyTemplate(data.optionValue) : undefined
                  }
                >
                  {templates.map((template) => (
                    <Option key={template.id} value={template.id} text={template.name}>
                      {`${template.name} · ${formatDuration(template.defaultDurationMinutes)}`}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            ) : null}

            <div className={styles.grid}>
              <DateField
                label="Datum"
                required
                value={dateKey}
                onChange={setDateKey}
                firstDayOfWeek={settings.weekStartsOn % 7}
              />
              <TimeField
                label="Von"
                required
                dateKey={dateKey}
                value={startTime}
                onChange={setStartTime}
                increment={settings.calendarSlotMinutes}
              />
              <TimeField
                label="Bis"
                required
                dateKey={dateKey}
                value={endTime}
                onChange={setEndTime}
                increment={settings.calendarSlotMinutes}
              />
              <Field label="Dauer (Minuten)">
                <SpinButton
                  min={5}
                  step={settings.calendarSlotMinutes}
                  value={Math.round(times.minutes)}
                  onChange={(_event, data) => {
                    const next = data.value ?? Number(data.displayValue)
                    if (Number.isFinite(next)) setDurationMinutes(Number(next))
                  }}
                />
              </Field>
            </div>

            <Field label="Projekt" required>
              <Combobox
                freeform
                placeholder="Projekt oder Kostenstelle"
                value={project}
                selectedOptions={project ? [project] : []}
                onInput={(event) => setProject((event.target as HTMLInputElement).value)}
                onOptionSelect={(_event, data) => setProject(data.optionValue ?? '')}
              >
                {knownProjects.map((item) => (
                  <Option key={item} value={item} text={item}>
                    {item}
                  </Option>
                ))}
              </Combobox>
            </Field>

            <Field label="Beschreibung der Aufgabe" required>
              <Textarea
                value={description}
                resize="vertical"
                placeholder="Was wurde in dieser Zeit bearbeitet?"
                onChange={(_event, data) => setDescription(data.value)}
              />
            </Field>

            <div className={styles.grid}>
              <Field label="Farbe">
                <Dropdown
                  value={BOOKING_COLORS[color].label}
                  selectedOptions={[color]}
                  onOptionSelect={(_event, data) => setColor(data.optionValue as BookingColor)}
                >
                  {BOOKING_COLOR_KEYS.map((key) => (
                    <Option key={key} value={key} text={BOOKING_COLORS[key].label}>
                      <span className={styles.optionRow}>
                        <span
                          className={styles.swatch}
                          style={{ backgroundColor: BOOKING_COLORS[key].background }}
                        />
                        {BOOKING_COLORS[key].label}
                      </span>
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Abrechenbar">
                <Switch
                  checked={billable}
                  label={billable ? 'ja' : 'nein'}
                  onChange={(_event, data) => setBillable(data.checked)}
                />
              </Field>
              <Field label="Dauer">
                <Button appearance="transparent" disabled>
                  {formatDuration(times.minutes)}
                </Button>
              </Field>
              <Field label="Als Vorlage">
                <Button icon={<BookmarkRegular />} onClick={handleSaveAsTemplate}>
                  Speichern
                </Button>
              </Field>
            </div>

            {warnings.map((warning) => (
              <MessageBar key={warning.id} intent={warning.severity}>
                <MessageBarBody>{warning.message}</MessageBarBody>
              </MessageBar>
            ))}
          </DialogContent>

          <DialogActions>
            {booking ? (
              <Button
                appearance="subtle"
                icon={<DeleteRegular />}
                onClick={() => {
                  deleteBooking(booking.id)
                  onOpenChange(false)
                }}
              >
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
