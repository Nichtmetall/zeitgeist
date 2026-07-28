import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent
} from 'react'
import { Caption1, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { buildDayTimeline } from '@shared/arbzg'
import { BOOKING_COLORS, WEEKDAY_LABELS, WEEKDAY_SHORT } from '@shared/defaults'
import {
  combineDateAndTime,
  formatDuration,
  formatTime,
  fromDateKey,
  isoWeekday,
  minutesBetween,
  minutesSinceMidnight,
  minutesToHhMm,
  parseIso,
  toLocalIso
} from '@shared/time'
import type { Booking, Settings, WorkEntry } from '@shared/types'

const HOUR_HEIGHT = 56

const useStyles = makeStyles({
  wrapper: {
    display: 'grid',
    gridTemplateColumns: '64px 1fr',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: 'auto',
    overflowX: 'hidden',
    maxHeight: 'calc(100vh - 330px)'
  },
  headerSpacer: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    height: '56px',
    position: 'sticky',
    top: 0,
    zIndex: 8
  },
  headerRow: {
    display: 'grid',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    position: 'sticky',
    top: 0,
    zIndex: 8
  },
  headerCell: {
    height: '56px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '2px'
  },
  headerToday: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2
  },
  gutter: {
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    position: 'relative'
  },
  gutterLabel: {
    position: 'absolute',
    right: tokens.spacingHorizontalS,
    transform: 'translateY(-50%)',
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums'
  },
  columns: {
    display: 'grid',
    position: 'relative'
  },
  column: {
    position: 'relative',
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    touchAction: 'none',
    userSelect: 'none'
  },
  columnWeekend: {
    backgroundColor: tokens.colorNeutralBackground2
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    pointerEvents: 'none'
  },
  slotLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `1px dotted ${tokens.colorNeutralStroke3}`,
    opacity: 0.5,
    pointerEvents: 'none'
  },
  workBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: tokens.colorPaletteGreenBackground2,
    opacity: 0.35,
    pointerEvents: 'none'
  },
  breakBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    opacity: 0.5,
    pointerEvents: 'none'
  },
  officeBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTop: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px dashed ${tokens.colorNeutralStroke2}`,
    pointerEvents: 'none'
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: tokens.colorPaletteRedBorderActive,
    pointerEvents: 'none',
    zIndex: 5
  },
  booking: {
    position: 'absolute',
    borderRadius: tokens.borderRadiusMedium,
    color: '#ffffff',
    overflow: 'hidden',
    cursor: 'grab',
    boxShadow: tokens.shadow4,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingTop: '2px',
    zIndex: 3
  },
  bookingTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: 'inherit',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden'
  },
  bookingMeta: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: 'inherit',
    opacity: 0.9,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden'
  },
  outside: {
    outline: `2px dashed ${tokens.colorPaletteDarkOrangeBorderActive}`,
    outlineOffset: '-2px'
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '7px',
    cursor: 'ns-resize'
  },
  ghost: {
    position: 'absolute',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground,
    opacity: 0.55,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: '2px 6px',
    pointerEvents: 'none',
    zIndex: 6
  }
})

export interface CalendarDraft {
  date: string
  startTime: string
  endTime: string
}

export interface CalendarGridProps {
  days: string[]
  bookings: Booking[]
  workEntries: WorkEntry[]
  settings: Settings
  now: Date
  onCreate: (draft: CalendarDraft) => void
  onEdit: (booking: Booking) => void
  onReschedule: (booking: Booking, start: string, end: string) => void
}

interface DragState {
  mode: 'create' | 'move' | 'resize'
  dayIndex: number
  startMinutes: number
  endMinutes: number
  bookingId?: string
  /** Abstand zwischen Zeigerposition und Buchungsbeginn beim Verschieben. */
  grabOffset: number
  moved: boolean
}

interface LaidOutBooking {
  booking: Booking
  lane: number
  lanes: number
  startMinutes: number
  endMinutes: number
}

/** Ordnet überlappende Buchungen nebeneinander an. */
function layoutDay(items: Booking[]): LaidOutBooking[] {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start))
  const result: LaidOutBooking[] = []
  let cluster: LaidOutBooking[] = []
  let clusterEnd = -1

  const flush = (): void => {
    const lanes = cluster.reduce((max, item) => Math.max(max, item.lane + 1), 0)
    for (const item of cluster) item.lanes = lanes
    result.push(...cluster)
    cluster = []
    clusterEnd = -1
  }

  for (const booking of sorted) {
    const startMinutes = minutesSinceMidnight(booking.start)
    const endMinutes = startMinutes + minutesBetween(booking.start, booking.end)
    if (cluster.length > 0 && startMinutes >= clusterEnd) flush()

    const usedLanes = new Set(
      cluster.filter((item) => item.endMinutes > startMinutes).map((item) => item.lane)
    )
    let lane = 0
    while (usedLanes.has(lane)) lane += 1

    cluster.push({ booking, lane, lanes: lane + 1, startMinutes, endMinutes })
    clusterEnd = Math.max(clusterEnd, endMinutes)
  }
  if (cluster.length > 0) flush()
  return result
}

export default function CalendarGrid({
  days,
  bookings,
  workEntries,
  settings,
  now,
  onCreate,
  onEdit,
  onReschedule
}: CalendarGridProps): JSX.Element {
  const styles = useStyles()
  const columnsRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const startHour = Math.max(0, Math.min(23, settings.calendarStartHour))
  const endHour = Math.max(startHour + 1, Math.min(24, settings.calendarEndHour))
  const slot = Math.max(5, settings.calendarSlotMinutes)
  const totalMinutes = (endHour - startHour) * 60
  const pxPerMinute = HOUR_HEIGHT / 60
  const bodyHeight = totalMinutes * pxPerMinute

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, LaidOutBooking[]>()
    for (const day of days) {
      map.set(day, layoutDay(bookings.filter((booking) => booking.date === day)))
    }
    return map
  }, [days, bookings])

  const timelinesByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDayTimeline>>()
    for (const day of days) {
      map.set(
        day,
        buildDayTimeline(
          workEntries.filter((entry) => entry.date === day),
          settings,
          now
        )
      )
    }
    return map
  }, [days, workEntries, settings, now])

  const officeStart = combineDateAndTime('2000-01-01', settings.workdayStart)
  const officeEnd = combineDateAndTime('2000-01-01', settings.workdayEnd)
  const officeStartMinutes = officeStart ? minutesSinceMidnight(officeStart) : 8 * 60
  const officeEndMinutes = officeEnd ? minutesSinceMidnight(officeEnd) : 17 * 60

  const toTop = useCallback(
    (minutes: number) => (minutes - startHour * 60) * pxPerMinute,
    [startHour, pxPerMinute]
  )

  const minutesFromPointer = useCallback(
    (clientY: number): number => {
      const container = columnsRef.current
      if (!container) return startHour * 60
      const rect = container.getBoundingClientRect()
      const offset = clientY - rect.top
      const raw = startHour * 60 + offset / pxPerMinute
      const snapped = Math.round(raw / slot) * slot
      return Math.max(startHour * 60, Math.min(endHour * 60, snapped))
    },
    [startHour, endHour, pxPerMinute, slot]
  )

  const dayIndexFromPointer = useCallback(
    (clientX: number): number => {
      const container = columnsRef.current
      if (!container) return 0
      const rect = container.getBoundingClientRect()
      const width = rect.width / days.length
      const index = Math.floor((clientX - rect.left) / width)
      return Math.max(0, Math.min(days.length - 1, index))
    },
    [days.length]
  )

  const dragRef = useRef<DragState | null>(null)
  const applyDrag = useCallback((next: DragState | null): void => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const beginCreate = (event: PointerEvent<HTMLDivElement>, dayIndex: number): void => {
    if (event.button !== 0) return
    const minutes = minutesFromPointer(event.clientY)
    applyDrag({
      mode: 'create',
      dayIndex,
      startMinutes: minutes,
      endMinutes: minutes + slot,
      grabOffset: 0,
      moved: false
    })
  }

  const beginMove = (
    event: PointerEvent<HTMLDivElement>,
    item: LaidOutBooking,
    dayIndex: number,
    mode: 'move' | 'resize'
  ): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    const pointerMinutes = minutesFromPointer(event.clientY)
    applyDrag({
      mode,
      dayIndex,
      startMinutes: item.startMinutes,
      endMinutes: item.endMinutes,
      bookingId: item.booking.id,
      grabOffset: pointerMinutes - item.startMinutes,
      moved: false
    })
  }

  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return undefined

    const handleMove = (event: globalThis.PointerEvent): void => {
      const current = dragRef.current
      if (!current) return
      const minutes = minutesFromPointer(event.clientY)

      if (current.mode === 'create') {
        applyDrag({
          ...current,
          dayIndex: dayIndexFromPointer(event.clientX),
          endMinutes: minutes,
          moved: true
        })
        return
      }
      if (current.mode === 'resize') {
        applyDrag({
          ...current,
          endMinutes: Math.max(current.startMinutes + slot, minutes),
          moved: true
        })
        return
      }
      const duration = current.endMinutes - current.startMinutes
      const nextStart = Math.max(
        startHour * 60,
        Math.min(endHour * 60 - duration, minutes - current.grabOffset)
      )
      applyDrag({
        ...current,
        dayIndex: dayIndexFromPointer(event.clientX),
        startMinutes: nextStart,
        endMinutes: nextStart + duration,
        moved: true
      })
    }

    const handleUp = (): void => {
      const current = dragRef.current
      applyDrag(null)
      if (!current) return

      const dayKey = days[current.dayIndex] ?? days[0]
      const from = Math.min(current.startMinutes, current.endMinutes)
      const to = Math.max(current.startMinutes, current.endMinutes)

      if (current.mode === 'create') {
        const duration = Math.max(slot, to - from)
        onCreate({
          date: dayKey,
          startTime: minutesToHhMm(from),
          endTime: minutesToHhMm(Math.min(endHour * 60, from + duration))
        })
        return
      }

      const booking = bookings.find((item) => item.id === current.bookingId)
      if (!booking) return
      if (!current.moved) {
        onEdit(booking)
        return
      }
      const start = combineDateAndTime(dayKey, minutesToHhMm(current.startMinutes))
      const end = combineDateAndTime(dayKey, minutesToHhMm(current.endMinutes))
      if (!start || !end) return
      onReschedule(booking, toLocalIso(start), toLocalIso(end))
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [
    dragging,
    days,
    bookings,
    slot,
    endHour,
    startHour,
    applyDrag,
    minutesFromPointer,
    dayIndexFromPointer,
    onCreate,
    onEdit,
    onReschedule
  ])

  const hourMarks = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index),
    [startHour, endHour]
  )

  const todayKeyValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
  const nowMinutes = minutesSinceMidnight(now)

  const gridTemplate = `repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerSpacer} />
      <div className={styles.headerRow} style={{ gridTemplateColumns: gridTemplate }}>
        {days.map((day) => {
          const date = fromDateKey(day)
          const isToday = day === todayKeyValue
          return (
            <div
              key={day}
              className={mergeClasses(styles.headerCell, isToday && styles.headerToday)}
            >
              <Caption1>
                {days.length === 1
                  ? WEEKDAY_LABELS[isoWeekday(date) - 1]
                  : WEEKDAY_SHORT[isoWeekday(date) - 1]}
              </Caption1>
              <Text weight={isToday ? 'bold' : 'regular'}>
                {date.getDate()}.{date.getMonth() + 1}.
              </Text>
            </div>
          )
        })}
      </div>

      <div className={styles.gutter} style={{ height: bodyHeight }}>
        {hourMarks.map((hour) => (
          <Caption1
            key={hour}
            className={styles.gutterLabel}
            style={{
              top: toTop(hour * 60),
              // Die erste Beschriftung würde sonst oben abgeschnitten.
              transform: hour === startHour ? 'translateY(0)' : undefined
            }}
          >
            {String(hour).padStart(2, '0')}:00
          </Caption1>
        ))}
      </div>

      <div
        ref={columnsRef}
        className={styles.columns}
        style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}
      >
        {days.map((day, dayIndex) => {
          const weekday = isoWeekday(fromDateKey(day))
          const isWorkday = settings.workdays.includes(weekday)
          const timeline = timelinesByDay.get(day)
          const laidOut = bookingsByDay.get(day) ?? []
          const isToday = day === todayKeyValue

          return (
            <div
              key={day}
              className={mergeClasses(styles.column, !isWorkday && styles.columnWeekend)}
              onPointerDown={(event) => beginCreate(event, dayIndex)}
              role="presentation"
            >
              {hourMarks.map((hour) => (
                <div key={hour} className={styles.hourLine} style={{ top: toTop(hour * 60) }} />
              ))}
              {slot < 60
                ? Array.from({ length: Math.floor(totalMinutes / slot) }, (_, index) => (
                    <div
                      key={index}
                      className={styles.slotLine}
                      style={{ top: toTop(startHour * 60 + index * slot) }}
                    />
                  ))
                : null}

              <div
                className={styles.officeBand}
                style={{
                  top: toTop(officeStartMinutes),
                  height: Math.max(0, (officeEndMinutes - officeStartMinutes) * pxPerMinute)
                }}
              />

              {timeline?.work.map((segment, index) => {
                const from = minutesSinceMidnight(new Date(segment.start))
                const to = minutesSinceMidnight(new Date(segment.end))
                return (
                  <div
                    key={`work-${index}`}
                    className={styles.workBand}
                    style={{
                      top: toTop(from),
                      height: Math.max(1, (to - from) * pxPerMinute)
                    }}
                  />
                )
              })}

              {timeline?.pauses.map((segment, index) => {
                const from = minutesSinceMidnight(new Date(segment.start))
                const to = minutesSinceMidnight(new Date(segment.end))
                return (
                  <div
                    key={`pause-${index}`}
                    className={styles.breakBand}
                    style={{
                      top: toTop(from),
                      height: Math.max(1, (to - from) * pxPerMinute)
                    }}
                  />
                )
              })}

              {isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 ? (
                <div className={styles.nowLine} style={{ top: toTop(nowMinutes) }} />
              ) : null}

              {laidOut.map((item) => {
                const dragging = drag?.bookingId === item.booking.id && drag.moved
                const top =
                  dragging && drag.dayIndex === dayIndex ? drag.startMinutes : item.startMinutes
                const bottom =
                  dragging && drag.dayIndex === dayIndex ? drag.endMinutes : item.endMinutes
                if (dragging && drag.dayIndex !== dayIndex) return null

                const palette = BOOKING_COLORS[item.booking.color] ?? BOOKING_COLORS.brand
                const width = 100 / item.lanes
                const covered = coveredByWork(item.booking, timeline)

                return (
                  <div
                    key={item.booking.id}
                    className={mergeClasses(
                      styles.booking,
                      settings.warnBookingOutsideWorkingHours && !covered && styles.outside
                    )}
                    style={{
                      top: toTop(top),
                      height: Math.max(16, (bottom - top) * pxPerMinute - 2),
                      left: `calc(${item.lane * width}% + 2px)`,
                      width: `calc(${width}% - 6px)`,
                      backgroundColor: palette.background,
                      borderLeft: `3px solid ${palette.border}`
                    }}
                    onPointerDown={(event) => beginMove(event, item, dayIndex, 'move')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onEdit(item.booking)
                    }}
                    title={`${item.booking.project} – ${item.booking.description}\n${formatTime(
                      item.booking.start
                    )}–${formatTime(item.booking.end)}`}
                  >
                    <span className={styles.bookingTitle}>
                      {item.booking.project || 'Ohne Projekt'}
                    </span>
                    <span className={styles.bookingMeta}>
                      {formatTime(item.booking.start)}–{formatTime(item.booking.end)} ·{' '}
                      {formatDuration(minutesBetween(item.booking.start, item.booking.end))}
                    </span>
                    {bottom - top >= 45 ? (
                      <span className={styles.bookingMeta}>{item.booking.description}</span>
                    ) : null}
                    <div
                      className={styles.resizeHandle}
                      onPointerDown={(event) => beginMove(event, item, dayIndex, 'resize')}
                    />
                  </div>
                )
              })}

              {drag && drag.mode === 'create' && drag.dayIndex === dayIndex ? (
                <div
                  className={styles.ghost}
                  style={{
                    top: toTop(Math.min(drag.startMinutes, drag.endMinutes)),
                    height: Math.max(
                      14,
                      Math.abs(drag.endMinutes - drag.startMinutes) * pxPerMinute
                    ),
                    left: '2px',
                    right: '4px'
                  }}
                >
                  <Caption1 style={{ color: 'inherit' }}>
                    {minutesToHhMm(Math.min(drag.startMinutes, drag.endMinutes))} –{' '}
                    {minutesToHhMm(Math.max(drag.startMinutes, drag.endMinutes))}
                  </Caption1>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Prüft, ob eine Buchung vollständig durch erfasste Arbeitszeit gedeckt ist. */
function coveredByWork(
  booking: Booking,
  timeline: ReturnType<typeof buildDayTimeline> | undefined
): boolean {
  if (!timeline) return false
  const start = parseIso(booking.start).getTime()
  const end = parseIso(booking.end).getTime()
  const covered = timeline.work.reduce(
    (total, segment) =>
      total + Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, start)),
    0
  )
  return covered >= end - start - 60_000
}
