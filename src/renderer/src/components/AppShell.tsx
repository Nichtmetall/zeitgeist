import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Divider,
  Menu,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Tab,
  TabList,
  Text,
  Title3,
  Tooltip,
  makeStyles,
  shorthands,
  tokens,
  type SelectTabEventHandler
} from '@fluentui/react-components'
import {
  CalendarLtrRegular,
  ClockRegular,
  DrinkCoffeeRegular,
  DocumentTableRegular,
  PauseRegular,
  PlayRegular,
  SettingsRegular,
  StopRegular,
  TextBulletListLtrRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular
} from '@fluentui/react-icons'
import { breakGuidance } from '@shared/arbzg'
import { formatDuration, formatTime, todayKey } from '@shared/time'
import type { ThemeMode } from '@shared/types'
import { useNow } from '../hooks/useNow'
import { useReminders } from '../hooks/useReminders'
import { flushPersist, selectRunningBreak, selectRunningEntry, useAppStore } from '../state/store'
import CalendarPage from '../pages/CalendarPage'
import EntriesPage from '../pages/EntriesPage'
import ReportsPage from '../pages/ReportsPage'
import SettingsPage from '../pages/SettingsPage'
import TrackerPage from '../pages/TrackerPage'
import { useNotify } from './notifications'

export type PageKey = 'tracker' | 'entries' | 'calendar' | 'reports' | 'settings'

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    backgroundColor: tokens.colorNeutralBackground3
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    paddingLeft: tokens.spacingHorizontalXXL,
    paddingRight: tokens.spacingHorizontalXXL,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '190px'
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexGrow: 1,
    flexWrap: 'wrap'
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS
  },
  body: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    minHeight: 0
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    width: '212px'
  },
  navFooter: {
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  content: {
    minHeight: 0,
    overflowY: 'auto',
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalXXL)
  },
  clock: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: tokens.fontWeightSemibold
  }
})

const PAGES: { key: PageKey; label: string; icon: JSX.Element }[] = [
  { key: 'tracker', label: 'Zeiterfassung', icon: <ClockRegular /> },
  { key: 'entries', label: 'Einträge', icon: <TextBulletListLtrRegular /> },
  { key: 'calendar', label: 'Kalender', icon: <CalendarLtrRegular /> },
  { key: 'reports', label: 'Export & Import', icon: <DocumentTableRegular /> },
  { key: 'settings', label: 'Einstellungen', icon: <SettingsRegular /> }
]

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Systemeinstellung',
  light: 'Hell',
  dark: 'Dunkel'
}

export default function AppShell(): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()
  const settings = useAppStore((state) => state.settings)
  const workEntries = useAppStore((state) => state.workEntries)
  const startWork = useAppStore((state) => state.startWork)
  const stopWork = useAppStore((state) => state.stopWork)
  const toggleBreak = useAppStore((state) => state.toggleBreak)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const runningEntry = useAppStore(selectRunningEntry)
  const runningBreak = useAppStore(selectRunningBreak)

  const [page, setPage] = useState<PageKey>(settings.startPage)
  const [importSignal, setImportSignal] = useState(0)

  const now = useNow(runningEntry ? 1000 : 30000)
  const today = todayKey(now)

  const todaysEntries = useMemo(
    () => workEntries.filter((entry) => entry.date === today),
    [workEntries, today]
  )
  const guidance = useMemo(
    () => breakGuidance(todaysEntries, settings, now),
    [todaysEntries, settings, now]
  )

  useReminders({ guidance, runningEntry, runningBreak })

  const onTabSelect = useCallback<SelectTabEventHandler>((_event, data) => {
    setPage(data.value as PageKey)
  }, [])

  const handleToggleWork = useCallback(() => {
    if (runningEntry) {
      stopWork()
      notify({ title: 'Arbeitszeit beendet', intent: 'success' })
    } else {
      startWork()
      notify({ title: 'Arbeitszeit gestartet', intent: 'success' })
    }
  }, [runningEntry, startWork, stopWork, notify])

  const handleToggleBreak = useCallback(() => {
    if (!runningEntry) {
      notify({
        title: 'Keine laufende Erfassung',
        body: 'Starte zuerst die Arbeitszeit, um eine Pause zu erfassen.',
        intent: 'warning'
      })
      return
    }
    const wasOnBreak = Boolean(runningBreak)
    toggleBreak()
    notify({
      title: wasOnBreak ? 'Pause beendet' : 'Pause gestartet',
      intent: wasOnBreak ? 'success' : 'info'
    })
  }, [runningEntry, runningBreak, toggleBreak, notify])

  /* Offene Änderungen sichern, bevor das Fenster geschlossen wird */
  useEffect(() => {
    return window.zeitwerk.onFlushRequest(() => {
      void flushPersist().finally(() => window.zeitwerk.reportFlushed())
    })
  }, [])

  /* Menübefehle des Hauptprozesses */
  useEffect(() => {
    const offNavigate = window.zeitwerk.onNavigate((target) => setPage(target as PageKey))
    const offCommand = window.zeitwerk.onCommand((command) => {
      if (command === 'toggle-work') handleToggleWork()
      if (command === 'toggle-break') handleToggleBreak()
      if (command === 'import-csv') {
        setPage('reports')
        setImportSignal((value) => value + 1)
      }
    })
    return () => {
      offNavigate()
      offCommand()
    }
  }, [handleToggleWork, handleToggleBreak])

  const runningMinutes = runningEntry
    ? Math.max(0, (now.getTime() - new Date(runningEntry.start).getTime()) / 60000)
    : 0

  const statusBadge = runningBreak ? (
    <Badge appearance="filled" color="warning" icon={<DrinkCoffeeRegular />} size="large">
      Pause seit {formatTime(runningBreak.start)}
    </Badge>
  ) : runningEntry ? (
    <Badge appearance="filled" color="success" icon={<PlayRegular />} size="large">
      Läuft seit {formatTime(runningEntry.start)}
    </Badge>
  ) : (
    <Badge appearance="outline" color="informative" size="large">
      Keine laufende Erfassung
    </Badge>
  )

  const guidanceColor =
    guidance.status === 'violated' || guidance.status === 'due'
      ? 'danger'
      : guidance.status === 'due_soon'
        ? 'warning'
        : 'informative'

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Title3>Zeitwerk</Title3>
          <Caption1>Arbeitszeit nach ArbZG</Caption1>
        </div>

        <div className={styles.status}>
          {statusBadge}
          {runningEntry ? (
            <Text className={styles.clock} size={400}>
              {formatDuration(runningMinutes)}
            </Text>
          ) : null}
          <Divider vertical style={{ height: '24px', flexGrow: 0 }} />
          <Badge appearance="tint" color={guidanceColor} size="large">
            Heute {formatDuration(guidance.workMinutes)} · Pause{' '}
            {Math.round(guidance.countedBreakMinutes)} min
          </Badge>
        </div>

        <div className={styles.actions}>
          <Tooltip content="Pause starten oder beenden (Strg+Umschalt+P)" relationship="label">
            <Button
              appearance={runningBreak ? 'primary' : 'secondary'}
              icon={runningBreak ? <PlayRegular /> : <PauseRegular />}
              onClick={handleToggleBreak}
              disabled={!runningEntry}
            >
              {runningBreak ? 'Pause beenden' : 'Pause'}
            </Button>
          </Tooltip>
          <Tooltip
            content="Arbeitszeit starten oder stoppen (Strg+Umschalt+S)"
            relationship="label"
          >
            <Button
              appearance="primary"
              icon={runningEntry ? <StopRegular /> : <PlayRegular />}
              onClick={handleToggleWork}
            >
              {runningEntry ? 'Stoppen' : 'Starten'}
            </Button>
          </Tooltip>
          <Menu
            checkedValues={{ theme: [settings.themeMode] }}
            onCheckedValueChange={(_event, data) =>
              updateSettings({ themeMode: data.checkedItems[0] as ThemeMode })
            }
          >
            <MenuTrigger disableButtonEnhancement>
              <Tooltip content="Darstellung" relationship="label">
                <Button
                  appearance="subtle"
                  icon={
                    settings.themeMode === 'dark' ? <WeatherMoonRegular /> : <WeatherSunnyRegular />
                  }
                  aria-label="Darstellung wählen"
                />
              </Tooltip>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(THEME_LABELS) as ThemeMode[]).map((mode) => (
                  <MenuItemRadio key={mode} name="theme" value={mode}>
                    {THEME_LABELS[mode]}
                  </MenuItemRadio>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Hauptnavigation">
          <TabList
            vertical
            appearance="subtle"
            size="large"
            selectedValue={page}
            onTabSelect={onTabSelect}
          >
            {PAGES.map((item) => (
              <Tab key={item.key} value={item.key} icon={item.icon}>
                {item.label}
              </Tab>
            ))}
          </TabList>
          <div className={styles.navFooter}>
            <Divider />
            <Caption1>{formatTime(now)} Uhr</Caption1>
            <Caption1>
              <Body1 as="span">{guidance.message}</Body1>
            </Caption1>
          </div>
        </nav>

        <main className={styles.content}>
          {page === 'tracker' ? <TrackerPage /> : null}
          {page === 'entries' ? <EntriesPage /> : null}
          {page === 'calendar' ? <CalendarPage /> : null}
          {page === 'reports' ? <ReportsPage importSignal={importSignal} /> : null}
          {page === 'settings' ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  )
}
