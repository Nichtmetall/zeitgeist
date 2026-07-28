/**
 * Excel-Export (.xlsx) auf Basis des gemeinsamen Berichtsmodells.
 */

import ExcelJS from 'exceljs'
import type { ReportModel } from '../shared/report'

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F6CBD' }
}

const TITLE_FONT: Partial<ExcelJS.Font> = { size: 14, bold: true, color: { argb: 'FF1B1A19' } }

function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/*?:[\]]/g, '').slice(0, 28) || 'Blatt'
  let name = base
  let counter = 2
  while (used.has(name)) {
    name = `${base.slice(0, 25)} ${counter}`
    counter += 1
  }
  used.add(name)
  return name
}

export async function writeXlsx(report: ReportModel, filePath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zeitwerk'
  workbook.created = new Date()

  const used = new Set<string>()

  /* --------------------------------- Deckblatt ---------------------------- */
  const overview = workbook.addWorksheet(sheetName('Übersicht', used), {
    views: [{ showGridLines: false }]
  })
  overview.columns = [{ width: 32 }, { width: 34 }]
  overview.addRow([report.title]).font = TITLE_FONT
  if (report.employee) overview.addRow(['Mitarbeiter/in', report.employee])
  overview.addRow(['Zeitraum', report.periodLabel])
  overview.addRow(['Erstellt am', report.generatedAt])
  overview.addRow([])

  const summaryHeader = overview.addRow(['Kennzahl', 'Wert'])
  summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summaryHeader.eachCell((cell) => {
    cell.fill = HEADER_FILL
  })
  for (const item of report.summary) {
    overview.addRow([item.label, item.value])
  }

  if (report.notes.length > 0) {
    overview.addRow([])
    const notesHeader = overview.addRow(['Hinweise nach Arbeitszeitgesetz', ''])
    notesHeader.font = { bold: true }
    for (const note of report.notes) {
      const row = overview.addRow([note.text, note.severity === 'error' ? 'Verstoß' : 'Hinweis'])
      row.getCell(1).alignment = { wrapText: true }
      if (note.severity === 'error')
        row.getCell(2).font = { color: { argb: 'FFA4262C' }, bold: true }
    }
  }

  /* ---------------------------------- Daten ------------------------------- */
  for (const section of report.sections) {
    const sheet = workbook.addWorksheet(sheetName(section.sheetName || section.title, used))
    sheet.columns = section.columns.map((column) => ({
      header: column.header,
      width: Math.max(10, column.width + 2)
    }))

    const header = sheet.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.height = 20
    header.eachCell((cell) => {
      cell.fill = HEADER_FILL
      cell.alignment = { vertical: 'middle' }
    })

    for (const row of section.rows) {
      const added = sheet.addRow(row)
      section.columns.forEach((column, index) => {
        if (column.align) {
          added.getCell(index + 1).alignment = { horizontal: column.align }
        }
      })
    }

    if (section.rows.length === 0 && section.emptyHint) {
      sheet.addRow([section.emptyHint])
    } else {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: section.columns.length }
      }
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  await workbook.xlsx.writeFile(filePath)
}
