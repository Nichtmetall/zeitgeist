import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  FluentProvider,
  Spinner,
  Toaster,
  makeStyles,
  teamsHighContrastTheme,
  tokens,
  webDarkTheme,
  webLightTheme,
  type Theme
} from '@fluentui/react-components'
import AppShell from './components/AppShell'
import { TOASTER_ID } from './components/notifications'
import { useAppStore } from './state/store'

const useStyles = makeStyles({
  provider: {
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground3
  },
  loading: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
})

function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setPrefersDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  return prefersDark
}

export default function App(): JSX.Element {
  const styles = useStyles()
  const loaded = useAppStore((state) => state.loaded)
  const load = useAppStore((state) => state.load)
  const themeMode = useAppStore((state) => state.settings.themeMode)
  const themeContrast = useAppStore((state) => state.settings.themeContrast)
  const prefersDark = usePrefersDark()

  useEffect(() => {
    void load()
  }, [load])

  const theme: Theme = useMemo(() => {
    if (themeContrast === 'highContrast') return teamsHighContrastTheme
    const dark = themeMode === 'dark' || (themeMode === 'system' && prefersDark)
    return dark ? webDarkTheme : webLightTheme
  }, [themeMode, themeContrast, prefersDark])

  useEffect(() => {
    document.body.style.backgroundColor = theme.colorNeutralBackground3
  }, [theme])

  return (
    <FluentProvider theme={theme} className={styles.provider}>
      <Toaster toasterId={TOASTER_ID} position="top-end" pauseOnHover pauseOnWindowBlur />
      {loaded ? (
        <AppShell />
      ) : (
        <div className={styles.loading}>
          <Spinner label="Daten werden geladen …" labelPosition="below" size="large" />
        </div>
      )}
    </FluentProvider>
  )
}
