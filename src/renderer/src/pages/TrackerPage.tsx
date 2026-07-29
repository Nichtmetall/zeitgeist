import { useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dropdown,
  Field,
  Option,
  ProgressBar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowResetRegular,
  DrinkCoffeeRegular,
  DeleteRegular,
  DeskRegular,
  EditRegular,
  PauseRegular,
  PersonRunningRegular,
  PlayRegular,
  SeatRegular,
  StopRegular
} from '@fluentui/react-icons'
import { breakGuidance, checkAveragingPeriod, summarizeDay, summarizePeriod } from '@shared/arbzg'
import { WORK_KIND_LABELS } from '@shared/defaults'
import {
  addDays,
  formatBalance,
  formatCountdown,
  formatDate,
  formatDateLong,
  formatDateMedium,
  formatDuration,
  formatTime,
  isoWeekNumber,
  minutesBetween,
  startOfWeek,
  toDateKey,
  todayKey
} from '@shared/time'
import type { ErgonomicsPhase, WorkEntry, WorkKind } from '@shared/types'
import DashboardCharts from '../components/DashboardCharts'
import { ComplianceMessages, SectionCard, StatRow, StatTile } from '../components/ui'
import { useNotify } from '../components/notifications'
import { useNow } from '../hooks/useNow'
import WorkEntryDialog from '../dialogs/WorkEntryDialog'
import {
  PHASE_HINTS,
  PHASE_LABELS,
  phaseDurationMinutes,
  useErgonomicsStore
} from '../state/ergonomics'
import { selectRunningBreak, selectRunningEntry, useAppStore } from '../state/store'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    maxWidth: '1200px'
  },
  hero: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXL,
    flexWrap: 'wrap'
  },
  clock: {
    fontVariantNumeric: 'tabular-nums',
    fontSize: tokens.fontSizeHero900,
    lineHeight: tokens.lineHeightHero900,
    fontWeight: tokens.fontWeightSemibold
  },
  heroActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  progressRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  ergonomics: {
    display: 'flex',
    gap: tokens.spacingHorizontalXXL,
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  ergonomicsMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: '260px',
    flexGrow: 1
  },
  countdown: {
    fontVariantNumeric: 'tabular-nums',
    fontSize: tokens.fontSizeHero800,
    fontWeight: tokens.fontWeightSemibold
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap'
  }
})

const PHASE_ICONS: Record<ErgonomicsPhase, JSX.Element> = {
  sit: <SeatRegular />,
  stand: <DeskRegular />,
  move: <PersonRunningRegular />
}

export default function TrackerPage(): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()

  const settings = useAppStore((state) => state.settings)
  const workEntries = useAppStore((state) => state.workEntries)
  const bookings = useAppStore((state) => state.bookings)
  const startWork = useAppStore((state) => state.startWork)
  const stopWork = useAppStore((state) => state.stopWork)
  const toggleBreak = useAppStore((state) => state.toggleBreak)
  const deleteWorkEntry = useAppStore((state) => state.deleteWorkEntry)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const runningEntry = useAppStore(selectRunningEntry)
  const runningBreak = useAppStore(selectRunningBreak)

  const ergonomics = useErgonomicsStore()
  const [kind, setKind] = useState<WorkKind>('office')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<WorkEntry | null>(null)

  const now = useNow(runningEntry ? 1000 : 30000)
  const today = todayKey(now)

  const todaysEntries = useMemo(
    () => workEntries.filter((entry) => entry.date === today),
    [workEntries, today]
  )
  const todaysBookings = useMemo(
    () => bookings.filter((booking) => booking.date === today),
    [bookings, today]
  )

  const summary = useMemo(
    () =>
      summarizeDay({
        dateKey: today,
        entries: todaysEntries,
        bookings: todaysBookings,
        settings,
        now
      }),
    [today, todaysEntries, todaysBookings, settings, now]
  )

  const guidance = useMemo(
    () => breakGuidance(todaysEntries, settings, now),
    [todaysEntries, settings, now]
  )

  const averaging = useMemo(
    () => checkAveragingPeriod(workEntries, settings, now),
    [workEntries, settings, now]
  )

  const week = useMemo(() => {
    const start = startOfWeek(now, settings.weekStartsOn)
    const keys = Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)))
    return summarizePeriod(keys, workEntries, bookings, settings, now)
  }, [now, workEntries, bookings, settings])

  const elapsedToday = summary.netMinutes
  const targetProgress = settings.dailyTargetMinutes
    ? Math.min(1, elapsedToday / settings.dailyTargetMinutes)
    : 0
  const breakProgress = summary.requiredBreakMinutes
    ? Math.min(1, summary.countedBreakMinutes / summary.requiredBreakMinutes)
    : 1

  const handleStart = (): void => {
    startWork(kind)
    notify({ title: 'Arbeitszeit gestartet', intent: 'success' })
  }

  const handleStop = (): void => {
    stopWork()
    notify({
      title: 'Arbeitszeit beendet',
      body: `Heute erfasst: ${formatDuration(summary.netMinutes)}`,
      intent: 'success'
    })
  }

  const issues = useMemo(() => {
    const list = [...summary.issues]
    if (averaging) list.push(averaging)
    return list.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  }, [summary.issues, averaging])

  return (
    <div className={styles.page}>
      <SectionCard
        title={formatDateLong(today)}
        description="Erfassung der Arbeitszeit mit Pausen nach dem Arbeitszeitgesetz"
        actions={
          <Button
            appearance="secondary"
            icon={<AddRegular />}
            onClick={() => {
              setEditEntry(null)
              setDialogOpen(true)
            }}
          >
            Zeit nachtragen
          </Button>
        }
      >
        <div className={styles.hero}>
          <div>
            <Caption1>
              {runningBreak ? 'Pause läuft' : runningEntry ? 'Arbeitszeit läuft' : 'Gestoppt'}
            </Caption1>
            <Text className={styles.clock} block>
              {formatDuration(elapsedToday, false)}
            </Text>
            <Caption1>
              {runningEntry
                ? `Aktueller Abschnitt seit ${formatTime(runningEntry.start)} Uhr`
                : 'Keine laufende Erfassung'}
            </Caption1>
          </div>

          <div className={styles.heroActions}>
            <Field label="Art der Tätigkeit">
              <Dropdown
                value={WORK_KIND_LABELS[kind]}
                selectedOptions={[kind]}
                disabled={Boolean(runningEntry)}
                onOptionSelect={(_event, data) => setKind(data.optionValue as WorkKind)}
              >
                {Object.entries(WORK_KIND_LABELS).map(([value, label]) => (
                  <Option key={value} value={value} text={label}>
                    {label}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            {runningEntry ? (
              <Button appearance="primary" size="large" icon={<StopRegular />} onClick={handleStop}>
                Arbeitszeit stoppen
              </Button>
            ) : (
              <Button
                appearance="primary"
                size="large"
                icon={<PlayRegular />}
                onClick={handleStart}
              >
                Arbeitszeit starten
              </Button>
            )}
            <Button
              size="large"
              appearance={runningBreak ? 'primary' : 'secondary'}
              icon={runningBreak ? <PlayRegular /> : <PauseRegular />}
              disabled={!runningEntry}
              onClick={() => toggleBreak()}
            >
              {runningBreak ? 'Pause beenden' : 'Pause starten'}
            </Button>
          </div>
        </div>

        <StatRow>
          <StatTile label="Netto heute" value={formatDuration(summary.netMinutes)} />
          <StatTile
            label="Pausen"
            value={formatDuration(summary.breakMinutes)}
            hint={`${Math.round(summary.countedBreakMinutes)} min anrechenbar`}
          />
          <StatTile label="Sollzeit" value={formatDuration(summary.targetMinutes)} />
          <StatTile
            label="Saldo"
            value={formatBalance(summary.balanceMinutes)}
            tone={summary.balanceMinutes >= 0 ? 'positive' : 'negative'}
          />
          <StatTile
            label="Anwesenheit"
            value={formatDuration(summary.grossMinutes)}
            hint={summary.firstStart ? `ab ${formatTime(summary.firstStart)} Uhr` : undefined}
          />
          <StatTile
            label="Projektzeit gebucht"
            value={formatDuration(summary.bookedMinutes)}
            hint={`${formatDuration(Math.abs(summary.bookedMinutes - summary.netMinutes))} Abweichung`}
          />
        </StatRow>

        <div className={styles.progressBlock}>
          <div className={styles.progressRow}>
            <Caption1>Tagessoll</Caption1>
            <Caption1>
              {formatDuration(elapsedToday)} von {formatDuration(settings.dailyTargetMinutes)}
            </Caption1>
          </div>
          <ProgressBar
            value={targetProgress}
            thickness="large"
            color={elapsedToday > settings.maxDailyWorkMinutes ? 'error' : 'brand'}
          />
          <div className={styles.progressRow}>
            <Caption1>Gesetzliche Ruhepause</Caption1>
            <Caption1>
              {Math.round(summary.countedBreakMinutes)} von {summary.requiredBreakMinutes} min
            </Caption1>
          </div>
          <ProgressBar
            value={breakProgress}
            thickness="large"
            color={breakProgress >= 1 ? 'success' : 'warning'}
          />
        </div>
      </SectionCard>

      <DashboardCharts days={week.days} />

      <SectionCard title="Hinweise nach Arbeitszeitgesetz" description={guidance.message}>
        <ComplianceMessages issues={issues} max={8} />
      </SectionCard>

      <SectionCard
        title="Bewegung nach der 40-15-5-Methode"
        description="40 Minuten dynamisch sitzen, 15 Minuten stehen, 5 Minuten bewegen"
        actions={
          <Switch
            checked={settings.ergonomicsEnabled}
            label={settings.ergonomicsEnabled ? 'Aktiv' : 'Deaktiviert'}
            onChange={(_event, data) => updateSettings({ ergonomicsEnabled: data.checked })}
          />
        }
      >
        {settings.ergonomicsEnabled ? (
          <div className={styles.ergonomics}>
            <div className={styles.ergonomicsMain}>
              <div className={styles.row}>
                <Badge
                  size="extra-large"
                  appearance="filled"
                  color={ergonomics.phase === 'sit' ? 'informative' : 'success'}
                  icon={PHASE_ICONS[ergonomics.phase]}
                >
                  {PHASE_LABELS[ergonomics.phase]}
                </Badge>
                <Text className={styles.countdown}>
                  {formatCountdown(ergonomics.remainingMs / 1000)}
                </Text>
                <Caption1>von {phaseDurationMinutes(ergonomics.phase, settings)} Minuten</Caption1>
              </div>
              <ProgressBar
                thickness="large"
                value={ergonomics.totalMs > 0 ? 1 - ergonomics.remainingMs / ergonomics.totalMs : 0}
              />
              <Body1>{PHASE_HINTS[ergonomics.phase]}</Body1>
              <Caption1>
                {ergonomics.running
                  ? `Zyklus läuft · ${ergonomics.completedCycles} abgeschlossene Zyklen heute`
                  : 'Der Zyklus startet automatisch mit der Arbeitszeiterfassung.'}
              </Caption1>
            </div>
            <div className={styles.row}>
              <Button
                icon={<PersonRunningRegular />}
                onClick={() => useErgonomicsStore.getState().skip(settings)}
              >
                Phase überspringen
              </Button>
              <Button
                appearance="subtle"
                icon={<ArrowResetRegular />}
                onClick={() => useErgonomicsStore.getState().resetCycle(settings)}
              >
                Zyklus zurücksetzen
              </Button>
            </div>
          </div>
        ) : (
          <Body1>
            Die Bewegungserinnerungen sind deaktiviert. Aktiviere sie hier oder in den
            Einstellungen, um im Wechsel von {settings.ergonomicsSitMinutes}/
            {settings.ergonomicsStandMinutes}/{settings.ergonomicsMoveMinutes} Minuten an
            Haltungswechsel erinnert zu werden.
          </Body1>
        )}
      </SectionCard>

      <SectionCard
        title={`Diese Woche (KW ${isoWeekNumber(now)})`}
        description={`${formatDate(week.days[0].date)} – ${formatDate(
          week.days[week.days.length - 1].date
        )}`}
      >
        <StatRow>
          <StatTile label="Nettoarbeitszeit" value={formatDuration(week.netMinutes)} />
          <StatTile label="Wochensoll" value={formatDuration(settings.weeklyTargetMinutes)} />
          <StatTile
            label="Saldo"
            value={formatBalance(week.netMinutes - settings.weeklyTargetMinutes)}
            tone={week.netMinutes - settings.weeklyTargetMinutes >= 0 ? 'positive' : 'negative'}
          />
          <StatTile label="Pausen" value={formatDuration(week.breakMinutes)} />
          <StatTile label="Projektzeit" value={formatDuration(week.bookedMinutes)} />
        </StatRow>
        <ProgressBar
          thickness="large"
          value={
            settings.weeklyTargetMinutes > 0
              ? Math.min(1, week.netMinutes / settings.weeklyTargetMinutes)
              : 0
          }
        />
        <Table size="small" aria-label="Wochenübersicht">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Tag</TableHeaderCell>
              <TableHeaderCell>Beginn</TableHeaderCell>
              <TableHeaderCell>Ende</TableHeaderCell>
              <TableHeaderCell>Pause</TableHeaderCell>
              <TableHeaderCell>Netto</TableHeaderCell>
              <TableHeaderCell>Soll</TableHeaderCell>
              <TableHeaderCell>Saldo</TableHeaderCell>
              <TableHeaderCell>Hinweise</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {week.days.map((day) => {
              const problems = day.issues.filter(
                (issue) => issue.severity === 'error' || issue.severity === 'warning'
              )
              return (
                <TableRow key={day.date}>
                  <TableCell>{formatDateMedium(day.date)}</TableCell>
                  <TableCell>{day.firstStart ? formatTime(day.firstStart) : '–'}</TableCell>
                  <TableCell>
                    {day.running ? 'läuft' : day.lastEnd ? formatTime(day.lastEnd) : '–'}
                  </TableCell>
                  <TableCell>
                    {day.breakMinutes > 0 ? formatDuration(day.breakMinutes) : '–'}
                  </TableCell>
                  <TableCell>{day.netMinutes > 0 ? formatDuration(day.netMinutes) : '–'}</TableCell>
                  <TableCell>{formatDuration(day.targetMinutes)}</TableCell>
                  <TableCell>
                    {day.netMinutes > 0 || day.targetMinutes > 0
                      ? formatBalance(day.balanceMinutes)
                      : '–'}
                  </TableCell>
                  <TableCell>
                    {problems.length > 0 ? (
                      <Tooltip
                        relationship="description"
                        content={problems.map((issue) => issue.title).join(' · ')}
                      >
                        <Badge
                          appearance="tint"
                          color={
                            problems.some((issue) => issue.severity === 'error')
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {problems.length}
                        </Badge>
                      </Tooltip>
                    ) : (
                      '–'
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Erfassungen heute"
        description={`${todaysEntries.length} Abschnitt${todaysEntries.length === 1 ? '' : 'e'}`}
      >
        {todaysEntries.length === 0 ? (
          <Body1>Für heute wurde noch keine Arbeitszeit erfasst.</Body1>
        ) : (
          <Table size="small" aria-label="Erfassungen des heutigen Tages">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Beginn</TableHeaderCell>
                <TableHeaderCell>Ende</TableHeaderCell>
                <TableHeaderCell>Pausen</TableHeaderCell>
                <TableHeaderCell>Netto</TableHeaderCell>
                <TableHeaderCell>Art</TableHeaderCell>
                <TableHeaderCell>Notiz</TableHeaderCell>
                <TableHeaderCell>Aktionen</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todaysEntries.map((entry) => {
                const breakMinutes = entry.breaks.reduce(
                  (total, pause) =>
                    pause.end ? total + minutesBetween(pause.start, pause.end) : total,
                  0
                )
                const grossMinutes = minutesBetween(entry.start, entry.end ?? now.toISOString())
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatTime(entry.start)}</TableCell>
                    <TableCell>
                      {entry.end ? (
                        formatTime(entry.end)
                      ) : (
                        <Badge appearance="tint" color="success">
                          läuft
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.breaks.length === 0 ? (
                        '–'
                      ) : (
                        <Tooltip
                          relationship="description"
                          content={entry.breaks
                            .map(
                              (pause) =>
                                `${formatTime(pause.start)}–${
                                  pause.end ? formatTime(pause.end) : 'läuft'
                                }`
                            )
                            .join(', ')}
                        >
                          <Badge appearance="tint" color="warning" icon={<DrinkCoffeeRegular />}>
                            {Math.round(breakMinutes)} min
                          </Badge>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDuration(Math.max(0, grossMinutes - breakMinutes))}
                    </TableCell>
                    <TableCell>{WORK_KIND_LABELS[entry.kind]}</TableCell>
                    <TableCell>{entry.note ?? ''}</TableCell>
                    <TableCell>
                      <Button
                        appearance="subtle"
                        icon={<EditRegular />}
                        aria-label="Eintrag bearbeiten"
                        onClick={() => {
                          setEditEntry(entry)
                          setDialogOpen(true)
                        }}
                      />
                      <Button
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        aria-label="Eintrag löschen"
                        onClick={() => {
                          deleteWorkEntry(entry.id)
                          notify({ title: 'Eintrag gelöscht', intent: 'success' })
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <WorkEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editEntry}
        defaultDate={today}
      />
    </div>
  )
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'error':
      return 3
    case 'warning':
      return 2
    case 'info':
      return 1
    default:
      return 0
  }
}
