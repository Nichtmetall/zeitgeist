import { useEffect, useState } from 'react'

/** Liefert die aktuelle Uhrzeit und aktualisiert sie im angegebenen Intervall. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}

/** Wie `useNow`, aktualisiert aber nur, wenn `active` wahr ist. */
export function useNowWhen(active: boolean, intervalMs = 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    if (!active) return undefined
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])

  return now
}
