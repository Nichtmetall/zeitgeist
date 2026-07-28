import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  DeleteRegular,
  DocumentPdfRegular,
  DocumentTableRegular,
  FolderOpenRegular,
  TableSimpleRegular
} from '@fluentui/react-icons'
import { buildCsv, dedupeImport, parseImportCsv, type CsvImportResult } from '@shared/csv'
import { buildReport } from '@shared/report'
import { addDays, formatDate, formatDuration, startOfWeek, toDateKey, todayKey } from '@shared/time'
import type { ExportDataset } from '@shared/types'
import { DateField } from '../components/fields'
import { useNotify } from '../components/notifications'
import { SectionCard, StatRow, StatTile } from '../components/ui'
import { buildPdf } from '../export/pdf'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
    maxWidth: '1100px'
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    alignItems: 'end'
  },
  buttons: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap'
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  }
})

export interface ReportsPageProps {
  /** Zähler, der bei jedem Menübefehl "CSV importieren" erhöht wird. */
  importSignal: number
}

export default function ReportsPage({ importSignal }: ReportsPageProps): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()

  const settings = useAppStore((state) => state.settings)
  const workEntries = useAppStore((state) => state.workEntries)
  const bookings = useAppStore((state) => state.bookings)
  const importEntries = useAppStore((state) => state.importEntries)
  const clearAllData = useAppStore((state) => state.clearAllData)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const [from, setFrom] = useState(() => toDateKey(startOfWeek(new Date(), settings.weekStartsOn)))
  const [to, setTo] = useState(() =>
    toDateKey(addDays(startOfWeek(new Date(), settings.weekStartsOn), 6))
  )
  const [dataset, setDataset] = useState<ExportDataset>('both')
  const [includeSummary, setIncludeSummary] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [dataPath, setDataPath] = useState('')
  const [pending, setPending] = useState<{ result: CsvImportResult; fileName: string } | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    void window.zeitwerk.dataPath().then(setDataPath)
  }, [])

  const selection = useMemo(() => {
    const inRange = <T extends { date: string }>(items: T[]): T[] =>
      items.filter((item) => item.date >= from && item.date <= to)
    return {
      workEntries: dataset === 'bookings' ? [] : inRange(workEntries),
      bookings: dataset === 'workEntries' ? [] : inRange(bookings)
    }
  }, [dataset, from, to, workEntries, bookings])

  const request = useMemo(
    () => ({ format: 'csv' as const, dataset, from, to, includeSummary }),
    [dataset, from, to, includeSummary]
  )

  const handleCsvExport = async (): Promise<void> => {
    setBusy('csv')
    try {
      const content = buildCsv(selection.workEntries, selection.bookings, settings)
      const result = await window.zeitwerk.saveText({
        defaultName: `zeitwerk_${from}_bis_${to}`,
        content,
        filterName: 'CSV-Datei',
        extension: 'csv'
      })
      reportResult(result, 'CSV')
    } finally {
      setBusy(null)
    }
  }

  const handleXlsxExport = async (): Promise<void> => {
    setBusy('xlsx')
    try {
      const report = buildReport(request, { workEntries, bookings, settings })
      const result = await window.zeitwerk.saveXlsx({
        defaultName: report.fileBaseName,
        report
      })
      reportResult(result, 'Excel-Datei')
    } finally {
      setBusy(null)
    }
  }

  const handlePdfExport = async (): Promise<void> => {
    setBusy('pdf')
    try {
      const report = buildReport(request, { workEntries, bookings, settings })
      const data = buildPdf(report)
      const result = await window.zeitwerk.saveBinary({
        defaultName: report.fileBaseName,
        data,
        filterName: 'PDF-Dokument',
        extension: 'pdf'
      })
      reportResult(result, 'PDF')
    } finally {
      setBusy(null)
    }
  }

  const reportResult = (
    result: { ok: boolean; canceled?: boolean; error?: string; filePath?: string },
    label: string
  ): void => {
    if (result.canceled) return
    if (!result.ok) {
      notify({ title: `${label}-Export fehlgeschlagen`, body: result.error, intent: 'error' })
      return
    }
    notify({
      title: `${label} gespeichert`,
      body: result.filePath,
      intent: 'success'
    })
  }

  const startImport = async (): Promise<void> => {
    const file = await window.zeitwerk.openCsv()
    if (file.canceled) return
    if (!file.ok || !file.content) {
      notify({ title: 'Import fehlgeschlagen', body: file.error, intent: 'error' })
      return
    }
    const result = parseImportCsv(file.content)
    setPending({ result, fileName: file.fileName ?? 'Import' })
  }

  useEffect(() => {
    if (importSignal > 0) void startImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSignal])

  const applyImport = (): void => {
    if (!pending) return
    const deduped = skipDuplicates
      ? dedupeImport(pending.result, { workEntries, bookings })
      : {
          workEntries: pending.result.workEntries,
          bookings: pending.result.bookings,
          duplicates: 0
        }
    importEntries(deduped.workEntries, deduped.bookings)
    notify({
      title: 'Import abgeschlossen',
      body: `${deduped.workEntries.length} Arbeitszeiten und ${deduped.bookings.length} Zeitbuchungen übernommen${
        deduped.duplicates > 0 ? `, ${deduped.duplicates} Duplikate übersprungen` : ''
      }.`,
      intent: 'success'
    })
    setPending(null)
  }

  const workMinutes = selection.workEntries.reduce((total, entry) => {
    if (!entry.end) return total
    const breaks = entry.breaks.reduce(
      (sum, pause) =>
        pause.end
          ? sum + (new Date(pause.end).getTime() - new Date(pause.start).getTime()) / 60000
          : sum,
      0
    )
    return (
      total + (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 60000 - breaks
    )
  }, 0)
  const bookedMinutes = selection.bookings.reduce(
    (total, booking) =>
      total + (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 60000,
    0
  )

  return (
    <div className={styles.page}>
      <SectionCard
        title="Export"
        description="Zeitraum und Datensätze wählen und als CSV, Excel oder PDF ausgeben"
      >
        <div className={styles.row}>
          <DateField
            label="Von"
            value={from}
            onChange={setFrom}
            firstDayOfWeek={settings.weekStartsOn % 7}
          />
          <DateField
            label="Bis"
            value={to}
            onChange={setTo}
            firstDayOfWeek={settings.weekStartsOn % 7}
          />
          <Button
            appearance="secondary"
            onClick={() => {
              const start = startOfWeek(new Date(), settings.weekStartsOn)
              setFrom(toDateKey(start))
              setTo(toDateKey(addDays(start, 6)))
            }}
          >
            Diese Woche
          </Button>
          <Button
            appearance="secondary"
            onClick={() => {
              const now = new Date()
              setFrom(toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)))
              setTo(toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
            }}
          >
            Dieser Monat
          </Button>
          <Button
            appearance="secondary"
            onClick={() => {
              setFrom(todayKey())
              setTo(todayKey())
            }}
          >
            Heute
          </Button>
        </div>

        <Field label="Datensätze">
          <RadioGroup
            layout="horizontal"
            value={dataset}
            onChange={(_event, data) => setDataset(data.value as ExportDataset)}
          >
            <Radio value="workEntries" label="Nur Arbeitszeiten" />
            <Radio value="bookings" label="Nur Zeitbuchungen" />
            <Radio value="both" label="Beides" />
          </RadioGroup>
        </Field>

        <Switch
          checked={includeSummary}
          label="Tages- und Projektübersicht sowie ArbZG-Hinweise beilegen (Excel und PDF)"
          onChange={(_event, data) => setIncludeSummary(data.checked)}
        />

        <StatRow>
          <StatTile
            label="Arbeitszeiten"
            value={String(selection.workEntries.length)}
            hint={formatDuration(workMinutes)}
          />
          <StatTile
            label="Zeitbuchungen"
            value={String(selection.bookings.length)}
            hint={formatDuration(bookedMinutes)}
          />
          <StatTile label="Zeitraum" value={`${formatDate(from)} – ${formatDate(to)}`} />
        </StatRow>

        <div className={styles.buttons}>
          <Button
            appearance="primary"
            icon={<DocumentTableRegular />}
            disabled={busy !== null}
            onClick={() => void handleCsvExport()}
          >
            Als CSV exportieren
          </Button>
          <Button
            icon={<TableSimpleRegular />}
            disabled={busy !== null}
            onClick={() => void handleXlsxExport()}
          >
            Als Excel (.xlsx) exportieren
          </Button>
          <Button
            icon={<DocumentPdfRegular />}
            disabled={busy !== null}
            onClick={() => void handlePdfExport()}
          >
            Als PDF exportieren
          </Button>
        </div>

        <div className={styles.row}>
          <Field label="Trennzeichen (CSV)">
            <RadioGroup
              layout="horizontal"
              value={settings.csvDelimiter}
              onChange={(_event, data) =>
                updateSettings({ csvDelimiter: data.value as ';' | ',' | '\t' })
              }
            >
              <Radio value=";" label="Semikolon" />
              <Radio value="," label="Komma" />
              <Radio value={'\t'} label="Tabulator" />
            </RadioGroup>
          </Field>
          <Field label="Titel des Berichts">
            <Input
              value={settings.reportTitle}
              onChange={(_event, data) => updateSettings({ reportTitle: data.value })}
            />
          </Field>
          <Field label="Name für den Nachweis">
            <Input
              value={settings.employeeName}
              placeholder="Vor- und Nachname"
              onChange={(_event, data) => updateSettings({ employeeName: data.value })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Import"
        description="CSV-Dateien einlesen – auch Exporte aus anderen Programmen mit den Spalten Datum, Beginn und Ende"
        actions={
          <Button
            appearance="primary"
            icon={<ArrowUploadRegular />}
            onClick={() => void startImport()}
          >
            CSV-Datei auswählen
          </Button>
        }
      >
        {pending ? (
          <div className={styles.column}>
            <MessageBar intent={pending.result.errors.length > 0 ? 'warning' : 'success'}>
              <MessageBarBody>
                <MessageBarTitle>{pending.fileName}</MessageBarTitle>
                {pending.result.workEntries.length} Arbeitszeiten und{' '}
                {pending.result.bookings.length} Zeitbuchungen erkannt
                {pending.result.skipped > 0
                  ? `, ${pending.result.skipped} Zeilen übersprungen`
                  : ''}
                .
              </MessageBarBody>
            </MessageBar>

            {pending.result.errors.length > 0 ? (
              <Table size="small" aria-label="Meldungen zum Import">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Meldung</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.result.errors.slice(0, 12).map((error) => (
                    <TableRow key={error}>
                      <TableCell>{error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}

            <Switch
              checked={skipDuplicates}
              label="Bereits vorhandene Einträge überspringen"
              onChange={(_event, data) => setSkipDuplicates(data.checked)}
            />

            <div className={styles.buttons}>
              <Button
                appearance="primary"
                icon={<ArrowDownloadRegular />}
                disabled={
                  pending.result.workEntries.length === 0 && pending.result.bookings.length === 0
                }
                onClick={applyImport}
              >
                Import übernehmen
              </Button>
              <Button appearance="secondary" onClick={() => setPending(null)}>
                Verwerfen
              </Button>
            </div>
          </div>
        ) : (
          <Body1>
            Erwartet werden die Spalten <strong>Typ</strong>, <strong>Datum</strong>,{' '}
            <strong>Beginn</strong>, <strong>Ende</strong>, <strong>Pausen</strong>,{' '}
            <strong>Projekt</strong>, <strong>Beschreibung</strong> und <strong>Notiz</strong>. Ein
            Export aus Zeitwerk kann unverändert wieder eingelesen werden.
          </Body1>
        )}
      </SectionCard>

      <SectionCard
        title="Lokale Daten"
        description="Alle Daten liegen ausschließlich auf diesem Rechner"
      >
        <Body1>
          Speicherort:{' '}
          <Link onClick={() => void window.zeitwerk.revealDataFile()}>{dataPath || '…'}</Link>
        </Body1>
        <div className={styles.buttons}>
          <Button
            icon={<FolderOpenRegular />}
            onClick={() => void window.zeitwerk.revealDataFile()}
          >
            Im Dateimanager anzeigen
          </Button>
          <Button
            icon={<DeleteRegular />}
            appearance="subtle"
            onClick={() => setConfirmClear(true)}
          >
            Alle Einträge löschen
          </Button>
        </div>
        <Caption1>
          <Badge appearance="tint" color="informative">
            {workEntries.length} Arbeitszeiten
          </Badge>{' '}
          <Badge appearance="tint" color="informative">
            {bookings.length} Zeitbuchungen
          </Badge>
        </Caption1>
      </SectionCard>

      <Dialog open={confirmClear} onOpenChange={(_event, data) => setConfirmClear(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Alle Einträge löschen</DialogTitle>
            <DialogContent>
              <Body1>
                Sämtliche Arbeitszeiten und Zeitbuchungen werden entfernt. Einstellungen und
                Vorlagen bleiben erhalten. Dieser Schritt kann nicht rückgängig gemacht werden.
              </Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirmClear(false)}>
                Abbrechen
              </Button>
              <Button
                appearance="primary"
                icon={<DeleteRegular />}
                onClick={() => {
                  clearAllData()
                  setConfirmClear(false)
                  notify({ title: 'Alle Einträge gelöscht', intent: 'success' })
                }}
              >
                Endgültig löschen
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
