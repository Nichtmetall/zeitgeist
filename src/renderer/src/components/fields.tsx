import { useEffect, useMemo, useState, type JSX } from 'react'
import { Field, type FieldProps } from '@fluentui/react-components'
import { DatePicker, type CalendarStrings } from '@fluentui/react-datepicker-compat'
import { TimePicker, type TimePickerProps } from '@fluentui/react-timepicker-compat'
import { formatDate, formatTime, fromDateKey, toDateKey } from '@shared/time'

/** Deutsche Beschriftungen für Kalender und Datumsauswahl. */
export const germanCalendarStrings: CalendarStrings = {
  months: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember'
  ],
  shortMonths: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  shortDays: ['S', 'M', 'D', 'M', 'D', 'F', 'S'],
  goToToday: 'Heute',
  prevMonthAriaLabel: 'Vorheriger Monat',
  nextMonthAriaLabel: 'Nächster Monat',
  prevYearAriaLabel: 'Vorheriges Jahr',
  nextYearAriaLabel: 'Nächstes Jahr',
  closeButtonAriaLabel: 'Schließen',
  monthPickerHeaderAriaLabel: '{0}, Jahr ändern',
  yearPickerHeaderAriaLabel: '{0}, Monat ändern'
}

/** Akzeptiert `8`, `08`, `830`, `8.30`, `8:30` und `08:30`. */
export function parseFlexibleTime(input: string): number | null {
  const trimmed = input.trim().replace(/\s*uhr\s*$/i, '')
  if (!trimmed) return null
  const match = /^(\d{1,2})(?:[:.,\s-]?(\d{1,2}))?$/.exec(trimmed)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = match[2] === undefined ? 0 : Number(match[2].padEnd(2, '0'))
  if (match[2] === undefined && match[1].length === 4) {
    hours = Number(match[1].slice(0, 2))
    return hours <= 23 ? hours * 60 + Number(match[1].slice(2)) : null
  }
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export interface DateFieldProps extends Omit<FieldProps, 'children' | 'onChange'> {
  /** Datum im Format `YYYY-MM-DD`. */
  value: string
  onChange: (dateKey: string) => void
  disabled?: boolean
  firstDayOfWeek?: number
}

export function DateField({
  value,
  onChange,
  disabled,
  firstDayOfWeek = 1,
  ...fieldProps
}: DateFieldProps): JSX.Element {
  const selected = useMemo(() => (value ? fromDateKey(value) : null), [value])

  return (
    <Field {...fieldProps}>
      <DatePicker
        value={selected}
        disabled={disabled}
        allowTextInput
        strings={germanCalendarStrings}
        firstDayOfWeek={firstDayOfWeek as never}
        formatDate={(date) => (date ? formatDate(date) : '')}
        parseDateFromString={(text) => {
          const match = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(text.trim())
          if (!match) return selected
          const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
          return new Date(year, Number(match[2]) - 1, Number(match[1]))
        }}
        placeholder="TT.MM.JJJJ"
        onSelectDate={(date) => {
          if (date) onChange(toDateKey(date))
        }}
      />
    </Field>
  )
}

export interface TimeFieldProps extends Omit<FieldProps, 'children' | 'onChange'> {
  /** Uhrzeit im Format `HH:mm`. */
  value: string
  onChange: (time: string) => void
  /** Kalendertag, auf den sich die Uhrzeit bezieht. */
  dateKey: string
  disabled?: boolean
  increment?: number
  startHour?: number
  endHour?: number
}

export function TimeField({
  value,
  onChange,
  dateKey,
  disabled,
  increment = 15,
  startHour = 0,
  endHour = 24,
  ...fieldProps
}: TimeFieldProps): JSX.Element {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  const anchor = useMemo(() => fromDateKey(dateKey), [dateKey])
  const selectedTime = useMemo(() => {
    const minutes = parseFlexibleTime(value)
    if (minutes === null) return null
    const date = fromDateKey(dateKey)
    date.setMinutes(minutes)
    return date
  }, [value, dateKey])

  const parse: TimePickerProps['parseTimeStringToDate'] = (input) => {
    if (!input) return { date: null, errorType: 'required-input' }
    const minutes = parseFlexibleTime(input)
    if (minutes === null) return { date: null, errorType: 'invalid-input' }
    const date = fromDateKey(dateKey)
    date.setMinutes(minutes)
    return { date }
  }

  return (
    <Field {...fieldProps}>
      <TimePicker
        freeform
        hourCycle="h23"
        disabled={disabled}
        increment={increment}
        startHour={startHour as never}
        endHour={endHour as never}
        dateAnchor={anchor}
        selectedTime={selectedTime}
        value={text}
        placeholder="HH:MM"
        parseTimeStringToDate={parse}
        formatDateToTimeString={(date) => formatTime(date)}
        onInput={(event) => setText((event.target as HTMLInputElement).value)}
        onTimeChange={(_event, data) => {
          if (data.selectedTime) {
            const next = formatTime(data.selectedTime)
            setText(next)
            onChange(next)
          } else {
            setText(data.selectedTimeText ?? '')
          }
        }}
      />
    </Field>
  )
}
