import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  SpinButton,
  Switch,
  Textarea,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { DeleteRegular, DismissRegular } from '@fluentui/react-icons'
import { BOOKING_COLORS, BOOKING_COLOR_KEYS } from '@shared/defaults'
import type { BookingColor, BookingTemplate } from '@shared/types'
import { useAppStore } from '../state/store'

const useStyles = makeStyles({
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end'
  },
  swatch: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    borderRadius: tokens.borderRadiusCircular,
    marginRight: tokens.spacingHorizontalS
  }
})

export interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: BookingTemplate | null
}

export default function TemplateDialog({
  open,
  onOpenChange,
  template
}: TemplateDialogProps): JSX.Element {
  const styles = useStyles()
  const addTemplate = useAppStore((state) => state.addTemplate)
  const updateTemplate = useAppStore((state) => state.updateTemplate)
  const deleteTemplate = useAppStore((state) => state.deleteTemplate)

  const [name, setName] = useState('')
  const [project, setProject] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(60)
  const [color, setColor] = useState<BookingColor>('brand')
  const [billable, setBillable] = useState(true)

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setProject(template?.project ?? '')
    setDescription(template?.description ?? '')
    setDuration(template?.defaultDurationMinutes ?? 60)
    setColor(template?.color ?? 'brand')
    setBillable(template?.billable ?? true)
  }, [open, template])

  const handleSave = (): void => {
    const payload = {
      name: name.trim() || project.trim() || 'Vorlage',
      project: project.trim(),
      description: description.trim(),
      defaultDurationMinutes: Math.max(5, duration),
      color,
      billable
    }
    if (template) updateTemplate(template.id, payload)
    else addTemplate(payload)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(_event, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label="Schließen"
                onClick={() => onOpenChange(false)}
              />
            }
          >
            {template ? 'Vorlage bearbeiten' : 'Neue Zeitbuchungs-Vorlage'}
          </DialogTitle>

          <DialogContent className={styles.column}>
            <Field label="Name der Vorlage" required>
              <Input
                value={name}
                placeholder="z. B. Daily Standup"
                onChange={(_event, data) => setName(data.value)}
              />
            </Field>
            <Field label="Projekt">
              <Input
                value={project}
                placeholder="Projekt oder Kostenstelle"
                onChange={(_event, data) => setProject(data.value)}
              />
            </Field>
            <Field label="Beschreibung">
              <Textarea
                value={description}
                resize="vertical"
                onChange={(_event, data) => setDescription(data.value)}
              />
            </Field>
            <div className={styles.row}>
              <Field label="Standarddauer (Minuten)">
                <SpinButton
                  min={5}
                  step={15}
                  value={duration}
                  onChange={(_event, data) => {
                    const next = data.value ?? Number(data.displayValue)
                    if (Number.isFinite(next)) setDuration(Number(next))
                  }}
                />
              </Field>
              <Field label="Farbe">
                <Dropdown
                  value={BOOKING_COLORS[color].label}
                  selectedOptions={[color]}
                  onOptionSelect={(_event, data) => setColor(data.optionValue as BookingColor)}
                >
                  {BOOKING_COLOR_KEYS.map((key) => (
                    <Option key={key} value={key} text={BOOKING_COLORS[key].label}>
                      <span>
                        <span
                          className={styles.swatch}
                          style={{ backgroundColor: BOOKING_COLORS[key].background }}
                        />
                        {BOOKING_COLORS[key].label}
                      </span>
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field label="Abrechenbar">
                <Switch
                  checked={billable}
                  label={billable ? 'ja' : 'nein'}
                  onChange={(_event, data) => setBillable(data.checked)}
                />
              </Field>
            </div>
          </DialogContent>

          <DialogActions>
            {template ? (
              <Button
                appearance="subtle"
                icon={<DeleteRegular />}
                onClick={() => {
                  deleteTemplate(template.id)
                  onOpenChange(false)
                }}
              >
                Löschen
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button appearance="primary" onClick={handleSave}>
              Speichern
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
