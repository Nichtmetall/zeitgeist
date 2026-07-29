import { useState, type JSX } from 'react'
import {
  Body1,
  Button,
  Caption1,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Slider,
  SpinButton,
  Switch,
  Tab,
  TabList,
  Title2,
  makeStyles,
  tokens,
  type SelectTabEventHandler
} from '@fluentui/react-components'
import {
  AccessibilityRegular,
  ArrowResetRegular,
  CalendarSettingsRegular,
  ClockRegular,
  DocumentTableRegular,
  InfoRegular,
  PersonWalkingRegular,
  WeatherSunnyRegular
} from '@fluentui/react-icons'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { formatDuration } from '@shared/time'
import type { Settings, ThemeContrast, ThemeMode } from '@shared/types'
import { TimeField } from '../components/fields'
import { useNotify } from '../components/notifications'
import { SectionCard } from '../components/ui'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  page: {
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 1fr)',
    gap: tokens.spacingHorizontalXXL,
    alignItems: 'start',
    maxWidth: '1120px',
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr'
    }
  },
  navigation: {
    position: 'sticky',
    top: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    '@media (max-width: 900px)': {
      position: 'static'
    }
  },
  content: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalM
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  },
  weekdays: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS
  }
})

type SettingsSection = 'work' | 'legal' | 'ergonomics' | 'calendar' | 'export' | 'appearance'

const SETTINGS_SECTIONS: {
  value: SettingsSection
  label: string
  icon: JSX.Element
}[] = [
  { value: 'work', label: 'Arbeitszeit', icon: <ClockRegular /> },
  { value: 'legal', label: 'Arbeitszeitgesetz', icon: <AccessibilityRegular /> },
  { value: 'ergonomics', label: 'Bewegung', icon: <PersonWalkingRegular /> },
  { value: 'calendar', label: 'Kalender', icon: <CalendarSettingsRegular /> },
  { value: 'export', label: 'Export', icon: <DocumentTableRegular /> },
  { value: 'appearance', label: 'Darstellung', icon: <WeatherSunnyRegular /> }
]

const WEEKDAYS = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Di' },
  { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 7, label: 'So' }
]

const START_PAGES: Record<Settings['startPage'], string> = {
  tracker: 'Zeiterfassung',
  entries: 'Einträge',
  calendar: 'Kalender',
  reports: 'Export & Import',
  settings: 'Einstellungen'
}

interface NumberSettingProps {
  label: string
  hint?: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

function NumberSetting({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 5
}: NumberSettingProps): JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <SpinButton
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_event, data) => {
          const next = data.value ?? Number(data.displayValue)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Number(next))))
        }}
      />
    </Field>
  )
}

export default function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const resetSettings = useAppStore((state) => state.resetSettings)
  const [confirmReset, setConfirmReset] = useState(false)
  const [section, setSection] = useState<SettingsSection>('work')

  const onSectionSelect: SelectTabEventHandler = (_event, data) => {
    setSection(data.value as SettingsSection)
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    updateSettings({ [key]: value } as Partial<Settings>)

  const restoreLegalDefaults = (): void => {
    updateSettings({
      maxDailyWorkMinutes: DEFAULT_SETTINGS.maxDailyWorkMinutes,
      maxExtendedDailyWorkMinutes: DEFAULT_SETTINGS.maxExtendedDailyWorkMinutes,
      averagingPeriodWeeks: DEFAULT_SETTINGS.averagingPeriodWeeks,
      breakThreshold1Minutes: DEFAULT_SETTINGS.breakThreshold1Minutes,
      breakDuration1Minutes: DEFAULT_SETTINGS.breakDuration1Minutes,
      breakThreshold2Minutes: DEFAULT_SETTINGS.breakThreshold2Minutes,
      breakDuration2Minutes: DEFAULT_SETTINGS.breakDuration2Minutes,
      minBreakBlockMinutes: DEFAULT_SETTINGS.minBreakBlockMinutes,
      maxWorkWithoutBreakMinutes: DEFAULT_SETTINGS.maxWorkWithoutBreakMinutes,
      minRestPeriodMinutes: DEFAULT_SETTINGS.minRestPeriodMinutes
    })
    notify({ title: 'Gesetzliche Standardwerte wiederhergestellt', intent: 'success' })
  }

  const toggleWeekday = (day: number, checked: boolean): void => {
    const next = checked
      ? [...settings.workdays, day].sort((a, b) => a - b)
      : settings.workdays.filter((item) => item !== day)
    set('workdays', next.length > 0 ? next : settings.workdays)
  }

  return (
    <div className={styles.page}>
      <aside className={styles.navigation}>
        <Title2>Einstellungen</Title2>
        <TabList
          vertical
          appearance="subtle"
          selectedValue={section}
          onTabSelect={onSectionSelect}
          aria-label="Einstellungsbereiche"
        >
          {SETTINGS_SECTIONS.map((item) => (
            <Tab key={item.value} value={item.value} icon={item.icon}>
              {item.label}
            </Tab>
          ))}
        </TabList>
      </aside>

      <div className={styles.content}>
        <MessageBar intent="info" icon={<InfoRegular />}>
          <MessageBarBody>
            Alle Vorgaben lassen sich anpassen. Die Voreinstellungen entsprechen dem deutschen{' '}
            <Link href="https://www.gesetze-im-internet.de/arbzg/" target="_blank" rel="noreferrer">
              Arbeitszeitgesetz
            </Link>
            . Änderungen wirken sofort auf alle Auswertungen und Hinweise.
          </MessageBarBody>
        </MessageBar>

        {section === 'work' ? (
          <>
            <SectionCard title="Sollarbeitszeit" description="Grundlage für Saldo und Tagesziel">
              <Field label="Arbeitstage">
                <div className={styles.weekdays}>
                  {WEEKDAYS.map((day) => (
                    <Checkbox
                      key={day.value}
                      label={day.label}
                      checked={settings.workdays.includes(day.value)}
                      onChange={(_event, data) => toggleWeekday(day.value, Boolean(data.checked))}
                    />
                  ))}
                </div>
              </Field>
              <div className={styles.grid}>
                <NumberSetting
                  label="Tagessoll (Minuten)"
                  hint={formatDuration(settings.dailyTargetMinutes)}
                  value={settings.dailyTargetMinutes}
                  step={15}
                  max={1440}
                  onChange={(value) => set('dailyTargetMinutes', value)}
                />
                <NumberSetting
                  label="Wochensoll (Minuten)"
                  hint={formatDuration(settings.weeklyTargetMinutes)}
                  value={settings.weeklyTargetMinutes}
                  step={30}
                  max={10080}
                  onChange={(value) => set('weeklyTargetMinutes', value)}
                />
                <TimeField
                  label="Regulärer Arbeitsbeginn"
                  dateKey="2000-01-03"
                  value={settings.workdayStart}
                  increment={15}
                  onChange={(value) => set('workdayStart', value)}
                />
                <TimeField
                  label="Reguläres Arbeitsende"
                  dateKey="2000-01-03"
                  value={settings.workdayEnd}
                  increment={15}
                  onChange={(value) => set('workdayEnd', value)}
                />
              </div>
              <Field label="Woche beginnt am">
                <RadioGroup
                  layout="horizontal"
                  value={String(settings.weekStartsOn)}
                  onChange={(_event, data) => set('weekStartsOn', Number(data.value))}
                >
                  <Radio value="1" label="Montag" />
                  <Radio value="7" label="Sonntag" />
                </RadioGroup>
              </Field>
            </SectionCard>

            <SectionCard title="Erfassung" description="Verhalten der Stoppuhr und Berechnung">
              <Switch
                checked={settings.autoDeductMissingBreak}
                label="Fehlende gesetzliche Pause automatisch von der Arbeitszeit abziehen"
                onChange={(_event, data) => set('autoDeductMissingBreak', data.checked)}
              />
              <Field
                label={`Rundung erfasster Zeiten: ${
                  settings.roundingMinutes === 0 ? 'keine' : `${settings.roundingMinutes} Minuten`
                }`}
              >
                <Slider
                  min={0}
                  max={30}
                  step={5}
                  value={settings.roundingMinutes}
                  onChange={(_event, data) => set('roundingMinutes', data.value)}
                />
              </Field>
              <NumberSetting
                label="Hinweis bei Inaktivität nach (Minuten, 0 = aus)"
                hint="Erinnert daran, eine vergessene laufende Erfassung zu beenden"
                value={settings.idleTimeoutMinutes}
                step={5}
                max={480}
                onChange={(value) => set('idleTimeoutMinutes', value)}
              />
            </SectionCard>
          </>
        ) : null}

        {section === 'legal' ? (
          <SectionCard
            title="Arbeitszeitgesetz"
            description="Grenzwerte für Höchstarbeitszeit, Ruhepausen und Ruhezeit"
            actions={
              <Button
                appearance="subtle"
                icon={<ArrowResetRegular />}
                onClick={restoreLegalDefaults}
              >
                Gesetzliche Werte
              </Button>
            }
          >
            <div className={styles.grid}>
              <NumberSetting
                label="Höchstarbeitszeit je Werktag (Minuten)"
                hint={`§ 3 ArbZG · ${formatDuration(settings.maxDailyWorkMinutes)}`}
                value={settings.maxDailyWorkMinutes}
                step={15}
                max={1440}
                onChange={(value) => set('maxDailyWorkMinutes', value)}
              />
              <NumberSetting
                label="Absolute Obergrenze (Minuten)"
                hint={`§ 3 Satz 2 ArbZG · ${formatDuration(settings.maxExtendedDailyWorkMinutes)}`}
                value={settings.maxExtendedDailyWorkMinutes}
                step={15}
                max={1440}
                onChange={(value) => set('maxExtendedDailyWorkMinutes', value)}
              />
              <NumberSetting
                label="Ausgleichszeitraum (Wochen)"
                hint="Zeitraum für den 8-Stunden-Durchschnitt"
                value={settings.averagingPeriodWeeks}
                step={1}
                min={1}
                max={104}
                onChange={(value) => set('averagingPeriodWeeks', value)}
              />
              <NumberSetting
                label="Vorwarnzeit für Hinweise (Minuten)"
                hint="Wie früh vor einer Grenze gewarnt wird"
                value={settings.warningLeadMinutes}
                step={5}
                max={120}
                onChange={(value) => set('warningLeadMinutes', value)}
              />
              <NumberSetting
                label="Pausenschwelle 1 (Minuten Arbeitszeit)"
                hint={`§ 4 ArbZG · über ${formatDuration(settings.breakThreshold1Minutes)}`}
                value={settings.breakThreshold1Minutes}
                step={15}
                max={1440}
                onChange={(value) => set('breakThreshold1Minutes', value)}
              />
              <NumberSetting
                label="Pausendauer 1 (Minuten)"
                value={settings.breakDuration1Minutes}
                step={5}
                max={240}
                onChange={(value) => set('breakDuration1Minutes', value)}
              />
              <NumberSetting
                label="Pausenschwelle 2 (Minuten Arbeitszeit)"
                hint={`§ 4 ArbZG · über ${formatDuration(settings.breakThreshold2Minutes)}`}
                value={settings.breakThreshold2Minutes}
                step={15}
                max={1440}
                onChange={(value) => set('breakThreshold2Minutes', value)}
              />
              <NumberSetting
                label="Pausendauer 2 (Minuten)"
                value={settings.breakDuration2Minutes}
                step={5}
                max={240}
                onChange={(value) => set('breakDuration2Minutes', value)}
              />
              <NumberSetting
                label="Mindestlänge eines Pausenabschnitts (Minuten)"
                hint="§ 4 Satz 2 ArbZG"
                value={settings.minBreakBlockMinutes}
                step={5}
                max={120}
                onChange={(value) => set('minBreakBlockMinutes', value)}
              />
              <NumberSetting
                label="Arbeit ohne Pause höchstens (Minuten)"
                hint={`§ 4 Satz 3 ArbZG · ${formatDuration(settings.maxWorkWithoutBreakMinutes)}`}
                value={settings.maxWorkWithoutBreakMinutes}
                step={15}
                max={1440}
                onChange={(value) => set('maxWorkWithoutBreakMinutes', value)}
              />
              <NumberSetting
                label="Ruhezeit nach Arbeitsende (Minuten)"
                hint={`§ 5 ArbZG · ${formatDuration(settings.minRestPeriodMinutes)}`}
                value={settings.minRestPeriodMinutes}
                step={30}
                max={1440}
                onChange={(value) => set('minRestPeriodMinutes', value)}
              />
            </div>
            <Switch
              checked={settings.warnOnSundayWork}
              label="Hinweis bei Arbeit an Sonntagen (§ 9 ArbZG)"
              onChange={(_event, data) => set('warnOnSundayWork', data.checked)}
            />
          </SectionCard>
        ) : null}

        {section === 'ergonomics' ? (
          <SectionCard
            title="Bewegung (40-15-5)"
            description="Erinnerungen zum Aufstehen, Stehen und Bewegen"
          >
            <Switch
              checked={settings.ergonomicsEnabled}
              label="Bewegungserinnerungen aktivieren"
              onChange={(_event, data) => set('ergonomicsEnabled', data.checked)}
            />
            <div className={styles.grid}>
              <NumberSetting
                label="Sitzen (Minuten)"
                value={settings.ergonomicsSitMinutes}
                step={5}
                min={1}
                max={240}
                onChange={(value) => set('ergonomicsSitMinutes', value)}
              />
              <NumberSetting
                label="Stehen (Minuten)"
                value={settings.ergonomicsStandMinutes}
                step={5}
                min={1}
                max={240}
                onChange={(value) => set('ergonomicsStandMinutes', value)}
              />
              <NumberSetting
                label="Bewegen (Minuten)"
                value={settings.ergonomicsMoveMinutes}
                step={1}
                min={1}
                max={120}
                onChange={(value) => set('ergonomicsMoveMinutes', value)}
              />
            </div>
            <Switch
              checked={settings.ergonomicsPauseOnBreak}
              label="Zyklus während erfasster Pausen anhalten"
              onChange={(_event, data) => set('ergonomicsPauseOnBreak', data.checked)}
            />
            <Switch
              checked={settings.ergonomicsSystemNotification}
              label="Systembenachrichtigung beim Phasenwechsel"
              onChange={(_event, data) => set('ergonomicsSystemNotification', data.checked)}
            />
            <Switch
              checked={settings.ergonomicsSound}
              label="Signalton beim Phasenwechsel"
              onChange={(_event, data) => set('ergonomicsSound', data.checked)}
            />
            <Caption1>
              Ein vollständiger Zyklus dauert{' '}
              {formatDuration(
                settings.ergonomicsSitMinutes +
                  settings.ergonomicsStandMinutes +
                  settings.ergonomicsMoveMinutes
              )}
              .
            </Caption1>
          </SectionCard>
        ) : null}

        {section === 'calendar' ? (
          <SectionCard title="Kalender" description="Darstellung der Tages- und Wochenansicht">
            <div className={styles.grid}>
              <NumberSetting
                label="Erste angezeigte Stunde"
                value={settings.calendarStartHour}
                step={1}
                min={0}
                max={23}
                onChange={(value) => set('calendarStartHour', value)}
              />
              <NumberSetting
                label="Letzte angezeigte Stunde"
                value={settings.calendarEndHour}
                step={1}
                min={1}
                max={24}
                onChange={(value) =>
                  set('calendarEndHour', Math.max(settings.calendarStartHour + 1, value))
                }
              />
            </div>
            <Field label="Raster der Zeitauswahl">
              <Dropdown
                value={`${settings.calendarSlotMinutes} Minuten`}
                selectedOptions={[String(settings.calendarSlotMinutes)]}
                onOptionSelect={(_event, data) =>
                  set('calendarSlotMinutes', Number(data.optionValue ?? 15))
                }
              >
                {[5, 10, 15, 30, 60].map((value) => (
                  <Option key={value} value={String(value)} text={`${value} Minuten`}>
                    {`${value} Minuten`}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Switch
              checked={settings.warnBookingOutsideWorkingHours}
              label="Hinweis, wenn eine Zeitbuchung außerhalb der Arbeitszeit liegt"
              onChange={(_event, data) => set('warnBookingOutsideWorkingHours', data.checked)}
            />
            <Switch
              checked={settings.warnBookingOverlap}
              label="Hinweis bei sich überschneidenden Zeitbuchungen"
              onChange={(_event, data) => set('warnBookingOverlap', data.checked)}
            />
          </SectionCard>
        ) : null}

        {section === 'export' ? (
          <SectionCard title="Export" description="Formatierung von CSV-, Excel- und PDF-Ausgaben">
            <Field label="CSV-Trennzeichen">
              <RadioGroup
                layout="horizontal"
                value={settings.csvDelimiter}
                onChange={(_event, data) =>
                  set('csvDelimiter', data.value as Settings['csvDelimiter'])
                }
              >
                <Radio value=";" label="Semikolon" />
                <Radio value="," label="Komma" />
                <Radio value={'\t'} label="Tabulator" />
              </RadioGroup>
            </Field>
            <Field label="Dezimaltrennzeichen">
              <RadioGroup
                layout="horizontal"
                value={settings.csvDecimalSeparator}
                onChange={(_event, data) =>
                  set('csvDecimalSeparator', data.value as Settings['csvDecimalSeparator'])
                }
              >
                <Radio value="," label="Komma" />
                <Radio value="." label="Punkt" />
              </RadioGroup>
            </Field>
            <Field label="Dauerformat">
              <RadioGroup
                layout="horizontal"
                value={settings.exportDurationFormat}
                onChange={(_event, data) =>
                  set('exportDurationFormat', data.value as Settings['exportDurationFormat'])
                }
              >
                <Radio value="hhmm" label="Stunden:Minuten" />
                <Radio value="decimal" label="Dezimalstunden" />
              </RadioGroup>
            </Field>
            <Field label="Berichtstitel">
              <Input
                value={settings.reportTitle}
                onChange={(_event, data) => set('reportTitle', data.value)}
              />
            </Field>
            <Field label="Name für Nachweise">
              <Input
                value={settings.employeeName}
                placeholder="Vor- und Nachname"
                onChange={(_event, data) => set('employeeName', data.value)}
              />
            </Field>
          </SectionCard>
        ) : null}

        {section === 'appearance' ? (
          <SectionCard title="Darstellung" description="Erscheinungsbild und Startverhalten">
            <Field label="Farbschema">
              <RadioGroup
                layout="horizontal"
                value={settings.themeMode}
                onChange={(_event, data) => set('themeMode', data.value as ThemeMode)}
              >
                <Radio value="system" label="System" />
                <Radio value="light" label="Hell" />
                <Radio value="dark" label="Dunkel" />
              </RadioGroup>
            </Field>
            <Field label="Kontrast">
              <RadioGroup
                layout="horizontal"
                value={settings.themeContrast}
                onChange={(_event, data) => set('themeContrast', data.value as ThemeContrast)}
              >
                <Radio value="default" label="Standard" />
                <Radio value="highContrast" label="Hoher Kontrast" />
              </RadioGroup>
            </Field>
            <Field label="Startseite">
              <Dropdown
                value={START_PAGES[settings.startPage]}
                selectedOptions={[settings.startPage]}
                onOptionSelect={(_event, data) =>
                  set('startPage', (data.optionValue ?? 'tracker') as Settings['startPage'])
                }
              >
                {(Object.keys(START_PAGES) as Settings['startPage'][]).map((page) => (
                  <Option key={page} value={page} text={START_PAGES[page]}>
                    {START_PAGES[page]}
                  </Option>
                ))}
              </Dropdown>
            </Field>
            <Button
              appearance="subtle"
              icon={<ArrowResetRegular />}
              onClick={() => setConfirmReset(true)}
            >
              Alle Einstellungen zurücksetzen
            </Button>
          </SectionCard>
        ) : null}

        <Dialog open={confirmReset} onOpenChange={(_event, data) => setConfirmReset(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Einstellungen zurücksetzen</DialogTitle>
              <DialogContent>
                <Body1>
                  Alle Parameter werden auf die Voreinstellungen nach dem Arbeitszeitgesetz
                  zurückgesetzt. Erfasste Zeiten bleiben unverändert.
                </Body1>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setConfirmReset(false)}>
                  Abbrechen
                </Button>
                <Button
                  appearance="primary"
                  onClick={() => {
                    resetSettings()
                    setConfirmReset(false)
                    notify({ title: 'Einstellungen zurückgesetzt', intent: 'success' })
                  }}
                >
                  Zurücksetzen
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
    </div>
  )
}
