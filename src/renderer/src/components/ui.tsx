import type { JSX, ReactNode } from 'react'
import {
  Caption1,
  Card,
  CardHeader,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Subtitle2,
  Text,
  makeStyles,
  shorthands,
  tokens
} from '@fluentui/react-components'
import type { ComplianceIssue, ComplianceSeverity } from '@shared/types'

const useStyles = makeStyles({
  card: {
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    rowGap: tokens.spacingVerticalM
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: '150px',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  },
  tileValue: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
    fontVariantNumeric: 'tabular-nums'
  },
  positive: { color: tokens.colorPaletteGreenForeground1 },
  negative: { color: tokens.colorPaletteRedForeground1 },
  neutral: { color: tokens.colorNeutralForeground1 },
  messages: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalXXXL, tokens.spacingHorizontalXXL),
    textAlign: 'center',
    color: tokens.colorNeutralForeground3
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM
  }
})

export interface SectionCardProps {
  title: string
  description?: string
  actions?: JSX.Element
  children: ReactNode
}

export function SectionCard({
  title,
  description,
  actions,
  children
}: SectionCardProps): JSX.Element {
  const styles = useStyles()
  return (
    <Card className={styles.card}>
      <CardHeader
        header={<Subtitle2>{title}</Subtitle2>}
        description={description ? <Caption1>{description}</Caption1> : undefined}
        action={actions}
      />
      {children}
    </Card>
  )
}

export interface StatTileProps {
  label: string
  value: string
  hint?: string
  tone?: 'positive' | 'negative' | 'neutral'
}

export function StatTile({ label, value, hint, tone = 'neutral' }: StatTileProps): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.tile}>
      <Caption1>{label}</Caption1>
      <Text className={`${styles.tileValue} ${styles[tone]}`}>{value}</Text>
      {hint ? <Caption1>{hint}</Caption1> : null}
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }): JSX.Element {
  const styles = useStyles()
  return <div className={styles.grid}>{children}</div>
}

const INTENT: Record<ComplianceSeverity, 'info' | 'warning' | 'error' | 'success'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  success: 'success'
}

export interface ComplianceMessagesProps {
  issues: ComplianceIssue[]
  /** Höchstzahl angezeigter Hinweise. */
  max?: number
  emptyText?: string
}

export function ComplianceMessages({
  issues,
  max = 6,
  emptyText
}: ComplianceMessagesProps): JSX.Element {
  const styles = useStyles()
  const visible = issues.slice(0, max)

  if (visible.length === 0) {
    return (
      <MessageBar intent="success">
        <MessageBarBody>
          <MessageBarTitle>Keine Beanstandungen</MessageBarTitle>
          {emptyText ?? 'Die erfassten Zeiten entsprechen den eingestellten Vorgaben.'}
        </MessageBarBody>
      </MessageBar>
    )
  }

  return (
    <div className={styles.messages}>
      {visible.map((issue) => (
        <MessageBar key={issue.id} intent={INTENT[issue.severity]}>
          <MessageBarBody>
            <MessageBarTitle>
              {issue.reference ? `${issue.reference}: ` : ''}
              {issue.title}
            </MessageBarTitle>
            {issue.detail}
          </MessageBarBody>
        </MessageBar>
      ))}
      {issues.length > visible.length ? (
        <Caption1>{issues.length - visible.length} weitere Hinweise …</Caption1>
      ) : null}
    </div>
  )
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  children?: ReactNode
}

export function EmptyState({ icon, title, description, children }: EmptyStateProps): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.empty}>
      {icon}
      <Subtitle2>{title}</Subtitle2>
      {description ? <Caption1>{description}</Caption1> : null}
      {children}
    </div>
  )
}
