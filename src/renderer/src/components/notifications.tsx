import { useCallback } from 'react'
import {
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
  type ToastIntent
} from '@fluentui/react-components'

export const TOASTER_ID = 'zeitwerk-toaster'

export interface NotifyOptions {
  title: string
  body?: string
  intent?: ToastIntent
  /** Anzeigedauer in Millisekunden. */
  timeout?: number
  /** Zusätzlich eine Systembenachrichtigung des Betriebssystems auslösen. */
  system?: boolean
}

/** Einheitlicher Zugriff auf App- und Systembenachrichtigungen. */
export function useNotify(): (options: NotifyOptions) => void {
  const { dispatchToast } = useToastController(TOASTER_ID)

  return useCallback(
    ({ title, body, intent = 'info', timeout = 6000, system = false }: NotifyOptions) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body ? <ToastBody>{body}</ToastBody> : null}
        </Toast>,
        { intent, timeout, position: 'top-end' }
      )
      if (system) {
        void window.zeitwerk.notify({ title, body: body ?? '', silent: true })
      }
    },
    [dispatchToast]
  )
}
