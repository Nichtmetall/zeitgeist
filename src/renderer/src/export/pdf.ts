/**
 * PDF-Ausgabe des Berichtsmodells.
 *
 * jsPDF läuft im Renderer; die fertigen Bytes werden zum Schreiben an den
 * Hauptprozess übergeben. Die Standardschrift Helvetica deckt den deutschen
 * Zeichensatz inklusive Umlauten ab.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReportModel } from '@shared/report'

const BRAND: [number, number, number] = [15, 108, 189]
const TEXT: [number, number, number] = [27, 26, 25]
const MUTED: [number, number, number] = [96, 94, 92]

export function buildPdf(report: ReportModel): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...TEXT)
  doc.text(report.title, 14, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  const subtitleParts = [report.periodLabel]
  if (report.employee) subtitleParts.unshift(report.employee)
  doc.text(subtitleParts.join(' · '), 14, 25)
  doc.text(`Erstellt am ${report.generatedAt}`, pageWidth - 14, 25, { align: 'right' })

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.8)
  doc.line(14, 28, pageWidth - 14, 28)

  autoTable(doc, {
    startY: 33,
    head: [['Kennzahl', 'Wert']],
    body: report.summary.map((item) => [item.label, item.value]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: TEXT },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 50, halign: 'right' } },
    margin: { left: 14, right: 14 }
  })

  for (const section of report.sections) {
    const startY = lastY(doc) + 14

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...TEXT)
    doc.text(section.title, 14, startY - 4)

    autoTable(doc, {
      startY,
      head: [section.columns.map((column) => column.header)],
      body:
        section.rows.length > 0
          ? section.rows
          : [[section.emptyHint ?? 'Keine Daten', ...section.columns.slice(1).map(() => '')]],
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TEXT },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: Object.fromEntries(
        section.columns.map((column, index) => [
          index,
          { halign: column.align ?? 'left', cellWidth: column.width * 1.9 }
        ])
      ),
      showHead: 'everyPage',
      margin: { left: 14, right: 14 }
    })
  }

  if (report.notes.length > 0) {
    autoTable(doc, {
      startY: lastY(doc) + 12,
      head: [['Hinweise nach Arbeitszeitgesetz', 'Einstufung']],
      body: report.notes.map((note) => [
        note.text,
        note.severity === 'error' ? 'Verstoß' : note.severity === 'warning' ? 'Warnung' : 'Hinweis'
      ]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TEXT },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 30, halign: 'center' } },
      margin: { left: 14, right: 14 }
    })
  }

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    const height = doc.internal.pageSize.getHeight()
    doc.text('Erstellt mit Zeitwerk – lokale Arbeitszeiterfassung', 14, height - 8)
    doc.text(`Seite ${page} von ${pageCount}`, pageWidth - 14, height - 8, { align: 'right' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/** Untere Kante der zuletzt gezeichneten Tabelle. */
function lastY(doc: jsPDF): number {
  const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  return table?.finalY ?? 33
}
