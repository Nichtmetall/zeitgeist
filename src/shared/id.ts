/** Erzeugt eine eindeutige ID – funktioniert im Browser- wie im Node-Kontext. */
export function createId(): string {
  const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
