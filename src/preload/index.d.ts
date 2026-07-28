import type { ZeitwerkApi } from './index'

declare global {
  interface Window {
    zeitwerk: ZeitwerkApi
  }
}

export {}
