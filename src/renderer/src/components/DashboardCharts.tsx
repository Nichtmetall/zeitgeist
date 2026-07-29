import { useEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { AreaChart, DonutChart, type ChartProps } from '@fluentui/react-charts'
import { Caption1, makeStyles, tokens } from '@fluentui/react-components'
import type { DaySummary } from '@shared/types'
import { formatDateMedium, formatDuration } from '@shared/time'
import { SectionCard } from './ui'

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 980px)': {
      gridTemplateColumns: '1fr'
    }
  },
  chart: {
    minWidth: 0,
    minHeight: '280px'
  },
  chartFrame: {
    width: '100%',
    minHeight: '240px'
  },
  note: {
    color: tokens.colorNeutralForeground3
  }
})

interface DashboardChartsProps {
  days: DaySummary[]
}

function useElementWidth(): {
  ref: RefObject<HTMLDivElement | null>
  width: number
} {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = (): void => setWidth(Math.floor(element.getBoundingClientRect().width))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

export default function DashboardCharts({ days }: DashboardChartsProps): JSX.Element {
  const styles = useStyles()
  const area = useElementWidth()
  const donut = useElementWidth()

  const areaData = useMemo<ChartProps>(
    () => ({
      chartTitle: 'Arbeitszeit im Wochenverlauf',
      chartTitleAccessibilityData: {
        ariaLabel: 'Flächendiagramm der Nettoarbeitszeit und Sollzeit dieser Woche'
      },
      lineChartData: [
        {
          legend: 'Nettoarbeitszeit',
          color: tokens.colorBrandBackground,
          opacity: 0.45,
          data: days.map((day) => ({
            x: new Date(`${day.date}T12:00:00`),
            y: Math.round((day.netMinutes / 60) * 10) / 10,
            xAxisCalloutData: formatDateMedium(day.date),
            yAxisCalloutData: formatDuration(day.netMinutes),
            callOutAccessibilityData: {
              ariaLabel: `${formatDateMedium(day.date)}: ${formatDuration(day.netMinutes)}`
            }
          }))
        },
        {
          legend: 'Sollzeit',
          color: tokens.colorNeutralForeground3,
          opacity: 0.12,
          data: days.map((day) => ({
            x: new Date(`${day.date}T12:00:00`),
            y: Math.round((day.targetMinutes / 60) * 10) / 10,
            xAxisCalloutData: formatDateMedium(day.date),
            yAxisCalloutData: formatDuration(day.targetMinutes)
          }))
        }
      ]
    }),
    [days]
  )

  const totals = useMemo(
    () =>
      days.reduce(
        (result, day) => ({
          net: result.net + day.netMinutes,
          breaks: result.breaks + day.breakMinutes
        }),
        { net: 0, breaks: 0 }
      ),
    [days]
  )

  const donutData = useMemo<ChartProps>(
    () => ({
      chartTitle: 'Verteilung der Anwesenheit',
      chartTitleAccessibilityData: {
        ariaLabel: 'Ringdiagramm der Arbeits- und Pausenzeit dieser Woche'
      },
      chartData: [
        {
          legend: 'Nettoarbeitszeit',
          data: totals.net,
          color: tokens.colorBrandBackground,
          yAxisCalloutData: formatDuration(totals.net),
          callOutAccessibilityData: {
            ariaLabel: `Nettoarbeitszeit: ${formatDuration(totals.net)}`
          }
        },
        {
          legend: 'Pausen',
          data: totals.breaks,
          color: tokens.colorPaletteYellowBackground3,
          yAxisCalloutData: formatDuration(totals.breaks),
          callOutAccessibilityData: {
            ariaLabel: `Pausen: ${formatDuration(totals.breaks)}`
          }
        }
      ]
    }),
    [totals]
  )

  return (
    <div className={styles.grid} aria-label="Diagramme zur Wochenübersicht">
      <SectionCard
        title="Wochenverlauf"
        description="Nettoarbeitszeit im Vergleich zur täglichen Sollzeit"
      >
        <div ref={area.ref} className={`${styles.chart} ${styles.chartFrame}`}>
          {area.width > 0 ? (
            <AreaChart
              width={area.width}
              height={250}
              data={areaData}
              enableGradient
              culture="de-DE"
              tickFormat="%a"
              yAxisTitle="Stunden"
              yAxisTickFormat={(value: number) => `${value} h`}
              legendProps={{ allowFocusOnLegends: true }}
            />
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Anwesenheit" description="Verhältnis von Arbeitszeit und Pausen">
        <div ref={donut.ref} className={`${styles.chart} ${styles.chartFrame}`}>
          {donut.width > 0 && totals.net + totals.breaks > 0 ? (
            <DonutChart
              width={donut.width}
              height={250}
              data={donutData}
              innerRadius={58}
              valueInsideDonut={formatDuration(totals.net + totals.breaks)}
              culture="de-DE"
              hideLabels={false}
              showLabelsInPercent
              legendProps={{ allowFocusOnLegends: true }}
            />
          ) : (
            <Caption1 className={styles.note}>
              Sobald Zeiten erfasst wurden, erscheint hier die Wochenverteilung.
            </Caption1>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
