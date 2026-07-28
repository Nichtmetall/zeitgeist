import { useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Body1,
  Button,
  Caption1,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  SearchBox,
  Tab,
  TabList,
  Toolbar,
  ToolbarDivider,
  Tooltip,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition,
  type TableRowId
} from '@fluentui/react-components'
import {
  AddRegular,
  DrinkCoffeeRegular,
  DeleteRegular,
  EditRegular,
  FilterRegular
} from '@fluentui/react-icons'
import { BOOKING_COLORS, WORK_KIND_LABELS } from '@shared/defaults'
import {
  addDays,
  formatDate,
  formatDuration,
  formatTime,
  minutesBetween,
  startOfWeek,
  toDateKey,
  todayKey
} from '@shared/time'
import type { Booking, WorkEntry } from '@shared/types'
import { DateField } from '../components/fields'
import { useNotify } from '../components/notifications'
import { EmptyState, SectionCard } from '../components/ui'
import BookingDialog from '../dialogs/BookingDialog'
import WorkEntryDialog from '../dialogs/WorkEntryDialog'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end',
    flexWrap: 'wrap'
  },
  grid: {
    minHeight: '260px'
  },
  swatch: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: tokens.borderRadiusCircular,
    marginRight: tokens.spacingHorizontalXS
  },
  summary: {
    display: 'flex',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center',
    flexWrap: 'wrap'
  }
})

type Dataset = 'work' | 'bookings'

function breakMinutesOf(entry: WorkEntry): number {
  return entry.breaks.reduce(
    (total, pause) => (pause.end ? total + minutesBetween(pause.start, pause.end) : total),
    0
  )
}

function netMinutesOf(entry: WorkEntry): number {
  if (!entry.end) return 0
  return Math.max(0, minutesBetween(entry.start, entry.end) - breakMinutesOf(entry))
}

export default function EntriesPage(): JSX.Element {
  const styles = useStyles()
  const notify = useNotify()

  const settings = useAppStore((state) => state.settings)
  const workEntries = useAppStore((state) => state.workEntries)
  const bookings = useAppStore((state) => state.bookings)
  const deleteWorkEntries = useAppStore((state) => state.deleteWorkEntries)
  const deleteBookings = useAppStore((state) => state.deleteBookings)

  const [dataset, setDataset] = useState<Dataset>('work')
  const [from, setFrom] = useState(() => toDateKey(addDays(new Date(), -30)))
  const [to, setTo] = useState(() => todayKey())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<TableRowId>>(() => new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [workDialogOpen, setWorkDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<WorkEntry | null>(null)
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [editBooking, setEditBooking] = useState<Booking | null>(null)

  const term = search.trim().toLowerCase()

  const filteredWork = useMemo(
    () =>
      workEntries
        .filter((entry) => entry.date >= from && entry.date <= to)
        .filter((entry) =>
          term
            ? `${entry.note ?? ''} ${WORK_KIND_LABELS[entry.kind]} ${entry.date}`
                .toLowerCase()
                .includes(term)
            : true
        )
        .sort((a, b) => b.start.localeCompare(a.start)),
    [workEntries, from, to, term]
  )

  const filteredBookings = useMemo(
    () =>
      bookings
        .filter((booking) => booking.date >= from && booking.date <= to)
        .filter((booking) =>
          term
            ? `${booking.project} ${booking.description} ${booking.date}`
                .toLowerCase()
                .includes(term)
            : true
        )
        .sort((a, b) => b.start.localeCompare(a.start)),
    [bookings, from, to, term]
  )

  const workColumns: TableColumnDefinition<WorkEntry>[] = useMemo(
    () => [
      createTableColumn<WorkEntry>({
        columnId: 'date',
        compare: (a, b) => a.start.localeCompare(b.start),
        renderHeaderCell: () => 'Datum',
        renderCell: (entry) => formatDate(entry.date)
      }),
      createTableColumn<WorkEntry>({
        columnId: 'start',
        compare: (a, b) => a.start.localeCompare(b.start),
        renderHeaderCell: () => 'Beginn',
        renderCell: (entry) => formatTime(entry.start)
      }),
      createTableColumn<WorkEntry>({
        columnId: 'end',
        compare: (a, b) => (a.end ?? '').localeCompare(b.end ?? ''),
        renderHeaderCell: () => 'Ende',
        renderCell: (entry) =>
          entry.end ? (
            formatTime(entry.end)
          ) : (
            <Badge appearance="tint" color="success">
              läuft
            </Badge>
          )
      }),
      createTableColumn<WorkEntry>({
        columnId: 'breaks',
        compare: (a, b) => breakMinutesOf(a) - breakMinutesOf(b),
        renderHeaderCell: () => 'Pausen',
        renderCell: (entry) => {
          const minutes = breakMinutesOf(entry)
          if (minutes <= 0) return '–'
          return (
            <Tooltip
              relationship="description"
              content={entry.breaks
                .map(
                  (pause) =>
                    `${formatTime(pause.start)}–${pause.end ? formatTime(pause.end) : 'läuft'}`
                )
                .join(', ')}
            >
              <Badge appearance="tint" color="warning" icon={<DrinkCoffeeRegular />}>
                {Math.round(minutes)} min
              </Badge>
            </Tooltip>
          )
        }
      }),
      createTableColumn<WorkEntry>({
        columnId: 'net',
        compare: (a, b) => netMinutesOf(a) - netMinutesOf(b),
        renderHeaderCell: () => 'Netto',
        renderCell: (entry) => formatDuration(netMinutesOf(entry))
      }),
      createTableColumn<WorkEntry>({
        columnId: 'kind',
        compare: (a, b) => a.kind.localeCompare(b.kind),
        renderHeaderCell: () => 'Art',
        renderCell: (entry) => WORK_KIND_LABELS[entry.kind]
      }),
      createTableColumn<WorkEntry>({
        columnId: 'note',
        compare: (a, b) => (a.note ?? '').localeCompare(b.note ?? ''),
        renderHeaderCell: () => 'Notiz',
        renderCell: (entry) => entry.note ?? ''
      }),
      createTableColumn<WorkEntry>({
        columnId: 'actions',
        renderHeaderCell: () => 'Aktionen',
        renderCell: (entry) => (
          <>
            <Button
              appearance="subtle"
              icon={<EditRegular />}
              aria-label="Bearbeiten"
              onClick={() => {
                setEditEntry(entry)
                setWorkDialogOpen(true)
              }}
            />
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label="Löschen"
              onClick={() => {
                deleteWorkEntries([entry.id])
                notify({ title: 'Eintrag gelöscht', intent: 'success' })
              }}
            />
          </>
        )
      })
    ],
    [deleteWorkEntries, notify]
  )

  const bookingColumns: TableColumnDefinition<Booking>[] = useMemo(
    () => [
      createTableColumn<Booking>({
        columnId: 'date',
        compare: (a, b) => a.start.localeCompare(b.start),
        renderHeaderCell: () => 'Datum',
        renderCell: (booking) => formatDate(booking.date)
      }),
      createTableColumn<Booking>({
        columnId: 'start',
        compare: (a, b) => a.start.localeCompare(b.start),
        renderHeaderCell: () => 'Von',
        renderCell: (booking) => formatTime(booking.start)
      }),
      createTableColumn<Booking>({
        columnId: 'end',
        compare: (a, b) => a.end.localeCompare(b.end),
        renderHeaderCell: () => 'Bis',
        renderCell: (booking) => formatTime(booking.end)
      }),
      createTableColumn<Booking>({
        columnId: 'duration',
        compare: (a, b) => minutesBetween(a.start, a.end) - minutesBetween(b.start, b.end),
        renderHeaderCell: () => 'Dauer',
        renderCell: (booking) => formatDuration(minutesBetween(booking.start, booking.end))
      }),
      createTableColumn<Booking>({
        columnId: 'project',
        compare: (a, b) => a.project.localeCompare(b.project, 'de'),
        renderHeaderCell: () => 'Projekt',
        renderCell: (booking) => (
          <span>
            <span
              className={styles.swatch}
              style={{ backgroundColor: BOOKING_COLORS[booking.color]?.background }}
            />
            {booking.project || '–'}
          </span>
        )
      }),
      createTableColumn<Booking>({
        columnId: 'description',
        compare: (a, b) => a.description.localeCompare(b.description, 'de'),
        renderHeaderCell: () => 'Beschreibung',
        renderCell: (booking) => booking.description
      }),
      createTableColumn<Booking>({
        columnId: 'billable',
        compare: (a, b) => Number(a.billable) - Number(b.billable),
        renderHeaderCell: () => 'Abrechenbar',
        renderCell: (booking) => (
          <Badge appearance="tint" color={booking.billable ? 'success' : 'informative'}>
            {booking.billable ? 'ja' : 'nein'}
          </Badge>
        )
      }),
      createTableColumn<Booking>({
        columnId: 'actions',
        renderHeaderCell: () => 'Aktionen',
        renderCell: (booking) => (
          <>
            <Button
              appearance="subtle"
              icon={<EditRegular />}
              aria-label="Bearbeiten"
              onClick={() => {
                setEditBooking(booking)
                setBookingDialogOpen(true)
              }}
            />
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              aria-label="Löschen"
              onClick={() => {
                deleteBookings([booking.id])
                notify({ title: 'Zeitbuchung gelöscht', intent: 'success' })
              }}
            />
          </>
        )
      })
    ],
    [deleteBookings, notify, styles.swatch]
  )

  const applyQuickRange = (range: 'today' | 'week' | 'month' | 'all'): void => {
    const now = new Date()
    if (range === 'today') {
      setFrom(todayKey(now))
      setTo(todayKey(now))
    } else if (range === 'week') {
      const start = startOfWeek(now, settings.weekStartsOn)
      setFrom(toDateKey(start))
      setTo(toDateKey(addDays(start, 6)))
    } else if (range === 'month') {
      setFrom(toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
    } else {
      const dates = [
        ...workEntries.map((entry) => entry.date),
        ...bookings.map((booking) => booking.date)
      ].sort()
      setFrom(dates[0] ?? todayKey(now))
      setTo(dates[dates.length - 1] ?? todayKey(now))
    }
    setSelected(new Set())
  }

  const selectedIds = [...selected].map(String)

  const handleBulkDelete = (): void => {
    if (dataset === 'work') deleteWorkEntries(selectedIds)
    else deleteBookings(selectedIds)
    notify({
      title: `${selectedIds.length} Einträge gelöscht`,
      intent: 'success'
    })
    setSelected(new Set())
    setConfirmOpen(false)
  }

  const totalMinutes =
    dataset === 'work'
      ? filteredWork.reduce((total, entry) => total + netMinutesOf(entry), 0)
      : filteredBookings.reduce(
          (total, booking) => total + minutesBetween(booking.start, booking.end),
          0
        )

  return (
    <div className={styles.page}>
      <SectionCard
        title="Einträge verwalten"
        description="Arbeitszeiten und Projektbuchungen filtern, bearbeiten und löschen"
        actions={
          <Button
            appearance="primary"
            icon={<AddRegular />}
            onClick={() => {
              if (dataset === 'work') {
                setEditEntry(null)
                setWorkDialogOpen(true)
              } else {
                setEditBooking(null)
                setBookingDialogOpen(true)
              }
            }}
          >
            {dataset === 'work' ? 'Arbeitszeit nachtragen' : 'Zeitbuchung anlegen'}
          </Button>
        }
      >
        <TabList
          selectedValue={dataset}
          onTabSelect={(_event, data) => {
            setDataset(data.value as Dataset)
            setSelected(new Set())
          }}
        >
          <Tab value="work">Arbeitszeiten ({filteredWork.length})</Tab>
          <Tab value="bookings">Zeitbuchungen ({filteredBookings.length})</Tab>
        </TabList>

        <div className={styles.filters}>
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
          <Toolbar aria-label="Schnellfilter">
            <Button
              appearance="subtle"
              icon={<FilterRegular />}
              onClick={() => applyQuickRange('today')}
            >
              Heute
            </Button>
            <Button appearance="subtle" onClick={() => applyQuickRange('week')}>
              Woche
            </Button>
            <Button appearance="subtle" onClick={() => applyQuickRange('month')}>
              Monat
            </Button>
            <Button appearance="subtle" onClick={() => applyQuickRange('all')}>
              Alles
            </Button>
            <ToolbarDivider />
            <Button
              appearance="subtle"
              icon={<DeleteRegular />}
              disabled={selectedIds.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Auswahl löschen ({selectedIds.length})
            </Button>
          </Toolbar>
          <SearchBox
            placeholder="Suchen …"
            value={search}
            onChange={(_event, data) => setSearch(data.value)}
          />
        </div>

        <div className={styles.summary}>
          <Caption1>
            Zeitraum {formatDate(from)} – {formatDate(to)}
          </Caption1>
          <Badge appearance="tint" color="brand" size="large">
            Summe: {formatDuration(totalMinutes)}
          </Badge>
        </div>

        {dataset === 'work' ? (
          filteredWork.length === 0 ? (
            <EmptyState
              title="Keine Arbeitszeiten im gewählten Zeitraum"
              description="Passe den Zeitraum an oder trage eine Arbeitszeit nach."
            />
          ) : (
            <DataGrid
              className={styles.grid}
              items={filteredWork}
              columns={workColumns}
              sortable
              resizableColumns
              selectionMode="multiselect"
              selectedItems={selected}
              onSelectionChange={(_event, data) => setSelected(new Set(data.selectedItems))}
              getRowId={(item) => item.id}
              focusMode="composite"
            >
              <DataGridHeader>
                <DataGridRow
                  selectionCell={{ checkboxIndicator: { 'aria-label': 'Alle auswählen' } }}
                >
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<WorkEntry>>
                {({ item, rowId }) => (
                  <DataGridRow<WorkEntry>
                    key={rowId}
                    selectionCell={{ checkboxIndicator: { 'aria-label': 'Zeile auswählen' } }}
                  >
                    {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          )
        ) : filteredBookings.length === 0 ? (
          <EmptyState
            title="Keine Zeitbuchungen im gewählten Zeitraum"
            description="Lege Buchungen im Kalender per Ziehen oder hier über die Schaltfläche an."
          />
        ) : (
          <DataGrid
            className={styles.grid}
            items={filteredBookings}
            columns={bookingColumns}
            sortable
            resizableColumns
            selectionMode="multiselect"
            selectedItems={selected}
            onSelectionChange={(_event, data) => setSelected(new Set(data.selectedItems))}
            getRowId={(item) => item.id}
            focusMode="composite"
          >
            <DataGridHeader>
              <DataGridRow
                selectionCell={{ checkboxIndicator: { 'aria-label': 'Alle auswählen' } }}
              >
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<Booking>>
              {({ item, rowId }) => (
                <DataGridRow<Booking>
                  key={rowId}
                  selectionCell={{ checkboxIndicator: { 'aria-label': 'Zeile auswählen' } }}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </SectionCard>

      <Dialog open={confirmOpen} onOpenChange={(_event, data) => setConfirmOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Einträge löschen</DialogTitle>
            <DialogContent>
              <Body1>
                {selectedIds.length} Eintrag/Einträge werden unwiderruflich gelöscht. Möchtest du
                fortfahren?
              </Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirmOpen(false)}>
                Abbrechen
              </Button>
              <Button appearance="primary" icon={<DeleteRegular />} onClick={handleBulkDelete}>
                Endgültig löschen
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <WorkEntryDialog open={workDialogOpen} onOpenChange={setWorkDialogOpen} entry={editEntry} />
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        booking={editBooking}
      />
    </div>
  )
}
