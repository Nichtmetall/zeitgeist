/**
 * Textaufbereitung für PDF-Standardschriften.
 *
 * Die in PDF eingebauten Schriften (Helvetica und Co.) verwenden die
 * WinAnsi-Kodierung. Zeichen außerhalb dieses Vorrats – etwa das typografische
 * Minuszeichen oder Emojis aus einer Notiz – würden im Dokument als
 * Buchstabensalat erscheinen. Sie werden deshalb vorher ersetzt.
 */

/** Zeichen außerhalb von WinAnsi, für die es eine sinnvolle Entsprechung gibt. */
const REPLACEMENTS: Record<string, string> = {
  '\u2212': '-',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2015': '-',
  '\u2044': '/',
  '\u00a0': ' ',
  '\u2007': ' ',
  '\u2009': ' ',
  '\u202f': ' ',
  '\u2192': '->',
  '\u2190': '<-',
  '\u2713': 'ok',
  '\u2714': 'ok'
}

/** In WinAnsi zusätzlich darstellbare Zeichen oberhalb von Latin-1. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

export function toWinAnsi(value: string): string {
  let result = ''
  for (const character of value) {
    const replacement = REPLACEMENTS[character]
    if (replacement !== undefined) {
      result += replacement
      continue
    }
    const code = character.codePointAt(0) ?? 0
    if (code === 9 || code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      result += character
    } else if (WIN_ANSI_EXTRA.includes(character)) {
      result += character
    } else {
      result += '?'
    }
  }
  return result
}
