import { useCallback, useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  CardHeader,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Subtitle2,
  Switch,
  Tab,
  TabList,
  Text,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  AddRegular,
  BookmarkRegular,
  CalendarTodayRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  EditRegular
} from '@fluentui/react-icons'
import { checkBooking, summarizePeriod } from '@shared/arbzg'
import { BOOKING_COLORS } from '@shared/defaults'
import {
  addDays,
  combineDateAndTime,
  formatDate,
  formatDateLong,
  formatDuration,
  isoWeekNumber,
  minutesBetween,
  startOfWeek,
  toDateKey,
  toLocalIso,
  todayKey
} from '@shared/time'
import type { Booking, BookingTemplate } from '@shared/types'
import CalendarGrid, { type CalendarDraft } from '../components/CalendarGrid'
import { useNotify } from '../components/notifications'
import { SectionCard, StatRow, StatTile } from '../components/ui'
import BookingDialog, { type BookingDraft } from '../dialogs/BookingDialog'
import TemplateDialog from '../dialogs/TemplateDialog'
import { useNow } from '../hooks/useNow'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap'
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 300px',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start'
  },
  side: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL
  },
  templateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS
  },
  templateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  },
  templateInfo: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0
  },
  swatch: {
    width: '10px',
    height: '32px',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0
  },
  label: {
    minWidth: '260px'
  },
  legend: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS
  },
  legendSwatch: {
    width: '14px',
    height: '14px',
    borderRadius: tokens.borderRadiusSmall,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  }
})

type ViewMode = 'day' | 'week'

export default function CalendarPage(): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()

  const settings = useAppStore((state) => state.settings)
  const bookings = useAppStore((state) => state.bookings)
  const workEntries = useAppStore((state) => state.workEntries)
  const templates = useAppStore((state) => state.templates)
  const addBooking = useAppStore((state) => state.addBooking)
  const updateBooking = useAppStore((state) => state.updateBooking)

  const now = useNow(60000)
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState<string>(() => todayKey())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editBooking, setEditBooking] = useState<Booking | null>(null)
  const [draft, setDraft] = useState<BookingDraft | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<BookingTemplate | null>(null)
  const [quickTemplateId, setQuickTemplateId] = useState<string>('')
  const [quickCreate, setQuickCreate] = useState(false)

  const days = useMemo(() => {
    if (view === 'day') return [anchor]
    const start = startOfWeek(anchor, settings.weekStartsOn)
    return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)))
  }, [view, anchor, settings.weekStartsOn])

  const period = useMemo(
    () => summarizePeriod(days, workEntries, bookings, settings, now),
    [days, workEntries, bookings, settings, now]
  )

  const outsideCount = useMemo(() => {
    let count = 0
    for (const booking of bookings.filter((item) => days.includes(item.date))) {
      const warnings = checkBooking(booking, { settings, workEntries, bookings })
      if (warnings.some((warning) => warning.id !== 'overlap')) count += 1
    }
    return count
  }, [bookings, days, settings, workEntries])

  const shift = (direction: number): void => {
    setAnchor(toDateKey(addDays(anchor, direction * (view === 'day' ? 1 : 7))))
  }

  const handleCreate = useCallback(
    (created: CalendarDraft) => {
      const template = templates.find((item) => item.id === quickTemplateId)
      if (quickCreate && template) {
        const start = combineDateAndTime(created.date, created.startTime)
        const end = combineDateAndTime(created.date, created.endTime)
        if (!start || !end) return
        addBooking({
          date: created.date,
          start: toLocalIso(start),
          end: toLocalIso(end),
          project: template.project,
          description: template.description,
          color: template.color,
          billable: template.billable,
          templateId: template.id
        })
        notify({
          title: 'Zeitbuchung angelegt',
          body: `${template.name}: ${created.startTime}–${created.endTime}`,
          intent: 'success'
        })
        return
      }

      setEditBooking(null)
      setDraft({
        date: created.date,
        startTime: created.startTime,
        endTime: created.endTime,
        project: template?.project,
        description: template?.description,
        color: template?.color,
        billable: template?.billable,
        templateId: template?.id
      })
      setDialogOpen(true)
    },
    [templates, quickTemplateId, quickCreate, addBooking, notify]
  )

  const handleEdit = useCallback((booking: Booking) => {
    setDraft(null)
    setEditBooking(booking)
    setDialogOpen(true)
  }, [])

  const handleReschedule = useCallback(
    (booking: Booking, start: string, end: string) => {
      updateBooking(booking.id, { date: toDateKey(start), start, end })
    },
    [updateBooking]
  )

  const applyTemplateToDay = (template: BookingTemplate): void => {
    const target = view === 'day' ? anchor : todayKey(now)
    const dayKey = days.includes(target) ? target : days[0]
    const dayBookings = bookings
      .filter((item) => item.date === dayKey)
      .sort((a, b) => a.end.localeCompare(b.end))
    const startBase = dayBookings.length
      ? new Date(dayBookings[dayBookings.length - 1].end)
      : combineDateAndTime(dayKey, settings.workdayStart)
    if (!startBase) return
    const end = new Date(startBase.getTime() + template.defaultDurationMinutes * 60000)
    addBooking({
      date: dayKey,
      start: toLocalIso(startBase),
      end: toLocalIso(end),
      project: template.project,
      description: template.description,
      color: template.color,
      billable: template.billable,
      templateId: template.id
    })
    notify({
      title: 'Zeitbuchung aus Vorlage angelegt',
      body: `${template.name} am ${formatDate(dayKey)}`,
      intent: 'success'
    })
  }

  const label =
    view === 'day'
      ? formatDateLong(anchor)
      : `KW ${isoWeekNumber(days[0])} · ${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`

  const bookedMinutes = period.bookedMinutes
  const workMinutes = period.netMinutes

  return (
    <div className={styles.page}>
      <SectionCard
        title="Zeitbuchung für Aufgaben und Projekte"
        description="Durch Ziehen im Raster wird ein neuer Arbeitsnachweis angelegt. Bestehende Buchungen lassen sich verschieben, in der Höhe ändern oder per Klick bearbeiten."
        actions={
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => {
              setEditBooking(null)
              setDraft({ date: days[0], startTime: settings.workdayStart, endTime: '10:00' })
              setDialogOpen(true)
            }}
          >
            Zeitbuchung anlegen
          </Button>
        }
      >
        <div className={styles.toolbar}>
          <TabList
            selectedValue={view}
            onTabSelect={(_event, data) => setView(data.value as ViewMode)}
          >
            <Tab value="day">Tagesansicht</Tab>
            <Tab value="week">Wochenansicht</Tab>
          </TabList>
          <Toolbar aria-label="Navigation">
            <ToolbarButton
              icon={<ChevronLeftRegular />}
              aria-label="Zurück"
              onClick={() => shift(-1)}
            />
            <ToolbarButton icon={<CalendarTodayRegular />} onClick={() => setAnchor(todayKey(now))}>
              Heute
            </ToolbarButton>
            <ToolbarButton
              icon={<ChevronRightRegular />}
              aria-label="Weiter"
              onClick={() => shift(1)}
            />
            <ToolbarDivider />
          </Toolbar>
          <Text className={styles.label} weight="semibold">
            {label}
          </Text>
        </div>

        <StatRow>
          <StatTile label="Gebuchte Projektzeit" value={formatDuration(bookedMinutes)} />
          <StatTile label="Erfasste Arbeitszeit" value={formatDuration(workMinutes)} />
          <StatTile
            label="Differenz"
            value={formatDuration(bookedMinutes - workMinutes)}
            tone={Math.abs(bookedMinutes - workMinutes) <= 15 ? 'positive' : 'negative'}
            hint="Buchungen abzüglich Arbeitszeit"
          />
          <StatTile
            label="Buchungen außerhalb der Arbeitszeit"
            value={String(outsideCount)}
            tone={outsideCount > 0 ? 'negative' : 'positive'}
          />
        </StatRow>

        {outsideCount > 0 && settings.warnBookingOutsideWorkingHours ? (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>
                {outsideCount} Buchung{outsideCount === 1 ? '' : 'en'} außerhalb der erfassten
                Arbeitszeit
              </MessageBarTitle>
              Solche Buchungen sind gestrichelt umrandet. Sie werden gespeichert – der Hinweis dient
              nur der Kontrolle.
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <div className={styles.layout}>
          <CalendarGrid
            days={days}
            bookings={bookings}
            workEntries={workEntries}
            settings={settings}
            now={now}
            onCreate={handleCreate}
            onEdit={handleEdit}
            onReschedule={handleReschedule}
          />

          <div className={styles.side}>
            <Card>
              <CardHeader
                header={<Subtitle2>Vorlagen</Subtitle2>}
                description={<Caption1>Schnell wiederkehrende Buchungen anlegen</Caption1>}
                action={
                  <Tooltip content="Neue Vorlage" relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<AddRegular />}
                      onClick={() => {
                        setEditTemplate(null)
                        setTemplateDialogOpen(true)
                      }}
                    />
                  </Tooltip>
                }
              />
              <div className={styles.templateList}>
                {templates.length === 0 ? (
                  <Body1>
                    Noch keine Vorlagen. Lege eine an oder speichere eine Buchung als Vorlage.
                  </Body1>
                ) : (
                  templates.map((template) => (
                    <div className={styles.templateRow} key={template.id}>
                      <div
                        className={styles.swatch}
                        style={{ backgroundColor: BOOKING_COLORS[template.color].background }}
                      />
                      <div className={styles.templateInfo}>
                        <Text weight="semibold" truncate wrap={false}>
                          {template.name}
                        </Text>
                        <Caption1>
                          {template.project || 'ohne Projekt'} ·{' '}
                          {formatDuration(template.defaultDurationMinutes)}
                        </Caption1>
                      </div>
                      <Tooltip content="Direkt eintragen" relationship="label">
                        <Button
                          appearance="subtle"
                          icon={<BookmarkRegular />}
                          onClick={() => applyTemplateToDay(template)}
                        />
                      </Tooltip>
                      <Tooltip content="Vorlage bearbeiten" relationship="label">
                        <Button
                          appearance="subtle"
                          icon={<EditRegular />}
                          onClick={() => {
                            setEditTemplate(template)
                            setTemplateDialogOpen(true)
                          }}
                        />
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>

              <Field label="Vorlage beim Ziehen verwenden">
                <Dropdown
                  placeholder="Keine Vorlage"
                  value={templates.find((item) => item.id === quickTemplateId)?.name ?? ''}
                  selectedOptions={quickTemplateId ? [quickTemplateId] : []}
                  onOptionSelect={(_event, data) => setQuickTemplateId(data.optionValue ?? '')}
                >
                  <Option value="" text="Keine Vorlage">
                    Keine Vorlage
                  </Option>
                  {templates.map((template) => (
                    <Option key={template.id} value={template.id} text={template.name}>
                      {template.name}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Switch
                checked={quickCreate}
                disabled={!quickTemplateId}
                label="Ohne Dialog sofort anlegen"
                onChange={(_event, data) => setQuickCreate(data.checked)}
              />
            </Card>

            <Card>
              <CardHeader header={<Subtitle2>Legende</Subtitle2>} />
              <div className={styles.legend}>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{ backgroundColor: tokens.colorPaletteGreenBackground2 }}
                  />
                  <Caption1>Erfasste Arbeitszeit</Caption1>
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{ backgroundColor: tokens.colorPaletteYellowBackground2 }}
                  />
                  <Caption1>Pause</Caption1>
                </span>
                <span className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{ border: `2px dashed ${tokens.colorPaletteDarkOrangeBorderActive}` }}
                  />
                  <Caption1>Buchung außerhalb der Arbeitszeit</Caption1>
                </span>
              </div>
            </Card>

            <Card>
              <CardHeader
                header={<Subtitle2>Projekte im Zeitraum</Subtitle2>}
                description={<Caption1>{formatDuration(bookedMinutes)} gebucht</Caption1>}
              />
              <div className={styles.templateList}>
                {projectTotals(bookings, days).map(([project, minutes]) => (
                  <div className={styles.templateRow} key={project}>
                    <div className={styles.templateInfo}>
                      <Text weight="semibold">{project}</Text>
                    </div>
                    <Badge appearance="tint" color="brand">
                      {formatDuration(minutes)}
                    </Badge>
                  </div>
                ))}
                {bookings.filter((item) => days.includes(item.date)).length === 0 ? (
                  <Body1>Keine Buchungen im gewählten Zeitraum.</Body1>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </SectionCard>

      <BookingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        booking={editBooking}
        draft={draft}
      />
      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editTemplate}
      />
    </div>
  )
}

function projectTotals(bookings: Booking[], days: string[]): [string, number][] {
  const totals = new Map<string, number>()
  for (const booking of bookings) {
    if (!days.includes(booking.date)) continue
    const key = booking.project || 'Ohne Projekt'
    totals.set(key, (totals.get(key) ?? 0) + minutesBetween(booking.start, booking.end))
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}
