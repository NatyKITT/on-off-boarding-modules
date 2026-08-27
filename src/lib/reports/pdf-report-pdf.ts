import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { loadPdfFonts, type PdfFontSet } from "@/lib/pdf-fonts"

import type {
  ChangeReportRow,
  ChangeValues,
  DocFlag,
  OffboardingDocuments,
  OffboardingReportRow,
  OnboardingDocuments,
  OnboardingReportRow,
  PeriodInfo,
  ReportSection,
} from "./pdf-report-types"

export const runtime = "nodejs"

const PAGE_WIDTH = 841.92
const PAGE_HEIGHT = 595.28

const MARGIN = 36
const CONTENT_LEFT = MARGIN
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT
const CONTENT_BOTTOM = 46
const FOOTER_Y = 24

const TITLE_SIZE = 16
const GROUP_TITLE_SIZE = 12.5
const MONTH_TITLE_SIZE = 10.5
const HEADER_TEXT_SIZE = 7.5
const CELL_TEXT_SIZE = 7
const CELL_LINE_HEIGHT = 9.5
const CELL_PADDING_X = 4
const CELL_PADDING_Y = 4
const ROW_MIN_HEIGHT = 15
const HEADER_ROW_HEIGHT = 16

const BLACK = rgb(0, 0, 0)
const BORDER_GRAY = rgb(0.6, 0.6, 0.6)
const COLUMN_GRAY = rgb(0.82, 0.82, 0.82)
const ZEBRA_GRAY = rgb(0.95, 0.95, 0.95)
const HEADER_BG = rgb(0.88, 0.9, 0.9)
const GREEN = rgb(0.11, 0.48, 0.16)
const AMBER = rgb(0.72, 0.42, 0.02)
const MUTED = rgb(0.35, 0.35, 0.35)

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value: string) => value.normalize("NFC")
const pad2 = (n: number) => String(n).padStart(2, "0")

function createPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  return `${formatDate(iso)} ${time}`
}

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-")
  const monthNames = [
    "leden",
    "únor",
    "březen",
    "duben",
    "květen",
    "červen",
    "červenec",
    "srpen",
    "září",
    "říjen",
    "listopad",
    "prosinec",
  ]
  const index = Number(monthNumber) - 1
  const label = monthNames[index] ?? monthNumber
  return `${label} ${year}`
}

function stackCell(primary?: string | null, secondary?: string | null): string {
  const primaryText = primary?.trim() || "—"
  const secondaryText = secondary?.trim()
  return secondaryText ? `${primaryText}\n${secondaryText}` : primaryText
}

function positionOrgCell(row: OnboardingReportRow | OffboardingReportRow) {
  return [row.positionName, row.positionNum, row.department, row.unitName]
    .map((value) => value?.trim() || "—")
    .join("\n")
}

function changeValuesCell(values: ChangeValues): string {
  const lines = [
    values.fullName,
    values.positionNum,
    values.positionName,
    values.department,
    values.unitName,
  ].filter((value): value is string => Boolean(value?.trim()))

  return lines.length ? lines.join("\n") : "—"
}

type RichSegment = {
  text: string
  bold?: boolean
  color?: "black" | "green" | "amber" | "muted"
}
type RichLine = RichSegment[]

const SEGMENT_COLOR: Record<
  NonNullable<RichSegment["color"]>,
  ReturnType<typeof rgb>
> = {
  black: BLACK,
  green: GREEN,
  amber: AMBER,
  muted: MUTED,
}

function flagSegment(flag: DocFlag): RichSegment {
  return flag.done
    ? { text: `Ano (${formatDate(flag.at)})`, color: "green" }
    : { text: "Ne", color: "amber" }
}

function periodLines(period: PeriodInfo | null): RichLine[] {
  if (!period) return [[{ text: "—" }]]

  const durationText = period.isCustom
    ? "vlastní"
    : period.months != null
      ? `${period.months} měs.`
      : "—"

  return [[{ text: durationText }], [{ text: `do ${formatDate(period.end)}` }]]
}

function statusItemLines(
  label: string,
  sent: DocFlag,
  filled: DocFlag
): RichLine[] {
  return [
    [{ text: label, bold: true }],
    [{ text: "Odesláno: " }, flagSegment(sent)],
    [{ text: "Vyplněno: " }, flagSegment(filled)],
  ]
}

function probationEvalLines(sent: DocFlag, filled: DocFlag): RichLine[] {
  return statusItemLines("Vyhodnocení zkušební doby", sent, filled)
}

function onboardingFormsRich(docs: OnboardingDocuments | null): RichLine[] {
  if (!docs) return [[{ text: "—" }]]

  return docs.forms.flatMap((form) =>
    statusItemLines(form.label, form.sent, form.filled)
  )
}

function offboardingDocumentsRich(docs: OffboardingDocuments): RichLine[] {
  return [
    [{ text: "Pozvánka k podpisu", bold: true }],
    [{ text: "Odesláno: " }, flagSegment(docs.inviteSent)],
    [
      { text: "Podepsáno všemi: " },
      docs.allSigned.done
        ? { text: "Ano", color: "green" }
        : { text: "Ne", color: "amber" },
    ],
  ]
}

type ColumnDef<Row> = {
  label: string
  weight: number
  cell?: (row: Row) => string
  wrap?: boolean
  richCell?: (row: Row) => RichLine[]
}

function splitLongWord(
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const chunks: string[] = []
  let current = ""

  for (const character of word) {
    const candidate = current + character

    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !current) {
      current = candidate
      continue
    }

    chunks.push(current)
    current = character
  }

  if (current) chunks.push(current)

  return chunks
}

function wrapParagraph(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(" ").filter(Boolean)
  if (words.length === 0) return [""]

  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word

    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ""
    }

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word
      continue
    }

    const chunks = splitLongWord(word, font, fontSize, maxWidth)
    lines.push(...chunks.slice(0, -1))
    current = chunks[chunks.length - 1] ?? ""
  }

  if (current) lines.push(current)

  return lines
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text

  const ellipsis = "…"
  let result = text

  while (
    result.length > 1 &&
    font.widthOfTextAtSize(result + ellipsis, fontSize) > maxWidth
  ) {
    result = result.slice(0, -1)
  }

  return result.trimEnd() + ellipsis
}

function plainCellLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  wrap: boolean
): RichLine[] {
  const paragraphs = nfc(text).replace(/\r\n/g, "\n").split("\n")

  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (wrap) {
      lines.push(...wrapParagraph(paragraph, font, fontSize, maxWidth))
    } else {
      lines.push(truncateToWidth(paragraph, font, fontSize, maxWidth))
    }
  }

  return lines.length
    ? lines.map((line) => [{ text: line }])
    : [[{ text: "—" }]]
}

function wrapRichLine(
  line: RichLine,
  fonts: PdfFontSet,
  fontSize: number,
  maxWidth: number
): RichLine[] {
  type Token = {
    word: string
    bold?: boolean
    color?: RichSegment["color"]
  }

  const tokens: Token[] = []
  for (const segment of line) {
    for (const word of segment.text.split(" ")) {
      if (word) tokens.push({ word, bold: segment.bold, color: segment.color })
    }
  }

  if (tokens.length === 0) return [[{ text: "" }]]

  const widthOf = (segments: RichLine) =>
    segments.reduce((sum, segment) => {
      const font = segment.bold ? fonts.bold : fonts.regular
      return sum + font.widthOfTextAtSize(segment.text, fontSize)
    }, 0)

  const lines: RichLine[] = []
  let current: RichLine = []

  for (const token of tokens) {
    const piece = current.length === 0 ? token.word : ` ${token.word}`
    const candidate: RichLine = [
      ...current,
      { text: piece, bold: token.bold, color: token.color },
    ]

    if (current.length === 0 || widthOf(candidate) <= maxWidth) {
      current = candidate
      continue
    }

    lines.push(current)
    current = [{ text: token.word, bold: token.bold, color: token.color }]
  }

  if (current.length > 0) lines.push(current)

  return lines.length ? lines : [[{ text: "" }]]
}

function columnWidths<Row>(columns: ColumnDef<Row>[], tableWidth: number) {
  const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0)
  return columns.map((col) => (col.weight / totalWeight) * tableWidth)
}

function drawColumnSeparators(
  page: PDFPage,
  widths: number[],
  top: number,
  bottom: number
) {
  let x = CONTENT_LEFT
  for (let i = 0; i < widths.length - 1; i++) {
    x += widths[i]
    page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.3,
      color: COLUMN_GRAY,
    })
  }
}

function drawTableFrame(page: PDFPage, top: number, bottom: number) {
  page.drawLine({
    start: { x: CONTENT_LEFT, y: top },
    end: { x: CONTENT_RIGHT, y: top },
    thickness: 0.8,
    color: BLACK,
  })
  page.drawLine({
    start: { x: CONTENT_LEFT, y: top },
    end: { x: CONTENT_LEFT, y: bottom },
    thickness: 0.6,
    color: BLACK,
  })
  page.drawLine({
    start: { x: CONTENT_RIGHT, y: top },
    end: { x: CONTENT_RIGHT, y: bottom },
    thickness: 0.6,
    color: BLACK,
  })
  page.drawLine({
    start: { x: CONTENT_LEFT, y: bottom },
    end: { x: CONTENT_RIGHT, y: bottom },
    thickness: 0.8,
    color: BLACK,
  })
}

function drawTableHeader<Row>(args: {
  page: PDFPage
  fonts: PdfFontSet
  y: number
  columns: ColumnDef<Row>[]
  widths: number[]
}) {
  const { page, fonts, y, columns, widths } = args

  page.drawRectangle({
    x: CONTENT_LEFT,
    y: y - HEADER_ROW_HEIGHT,
    width: CONTENT_WIDTH,
    height: HEADER_ROW_HEIGHT,
    color: HEADER_BG,
  })

  let x = CONTENT_LEFT
  for (let i = 0; i < columns.length; i++) {
    const label = truncateToWidth(
      columns[i].label,
      fonts.bold,
      HEADER_TEXT_SIZE,
      widths[i] - CELL_PADDING_X * 2
    )

    page.drawText(nfc(label), {
      x: x + CELL_PADDING_X,
      y: y - HEADER_ROW_HEIGHT + 5,
      size: HEADER_TEXT_SIZE,
      font: fonts.bold,
      color: BLACK,
    })
    x += widths[i]
  }

  drawColumnSeparators(page, widths, y, y - HEADER_ROW_HEIGHT)

  page.drawLine({
    start: { x: CONTENT_LEFT, y: y - HEADER_ROW_HEIGHT },
    end: { x: CONTENT_RIGHT, y: y - HEADER_ROW_HEIGHT },
    thickness: 0.7,
    color: BLACK,
  })

  return y - HEADER_ROW_HEIGHT
}

function drawTable<Row>(args: {
  pdf: PDFDocument
  page: PDFPage
  fonts: PdfFontSet
  y: number
  columns: ColumnDef<Row>[]
  rows: Row[]
  continuationTitle: string
}): { page: PDFPage; y: number } {
  const { pdf, columns, rows, continuationTitle } = args
  const widths = columnWidths(columns, CONTENT_WIDTH)

  let page = args.page
  let y = args.y
  let segmentTop = y

  const startNewPage = () => {
    drawTableFrame(page, segmentTop, y)

    page = createPage(pdf)
    let headerY = cv(48)
    page.drawText(nfc(continuationTitle), {
      x: CONTENT_LEFT,
      y: headerY,
      size: MONTH_TITLE_SIZE,
      font: args.fonts.bold,
      color: BLACK,
    })
    headerY -= 18
    segmentTop = headerY
    y = drawTableHeader({
      page,
      fonts: args.fonts,
      y: headerY,
      columns,
      widths,
    })
  }

  y = drawTableHeader({ page, fonts: args.fonts, y, columns, widths })

  if (rows.length === 0) {
    page.drawText("Žádné záznamy.", {
      x: CONTENT_LEFT + CELL_PADDING_X,
      y: y - 14,
      size: CELL_TEXT_SIZE,
      font: args.fonts.regular,
      color: BLACK,
    })
    y -= 22
    drawTableFrame(page, segmentTop, y)
    return { page, y }
  }

  rows.forEach((row, rowIndex) => {
    const linesPerColumn = columns.map((col, colIndex) => {
      const maxWidth = widths[colIndex] - CELL_PADDING_X * 2

      if (col.richCell) {
        return col
          .richCell(row)
          .flatMap((line) =>
            wrapRichLine(line, args.fonts, CELL_TEXT_SIZE, maxWidth)
          )
      }

      return plainCellLines(
        col.cell?.(row) ?? "",
        args.fonts.regular,
        CELL_TEXT_SIZE,
        maxWidth,
        col.wrap ?? false
      )
    })

    const lineCount = Math.max(...linesPerColumn.map((lines) => lines.length))
    const rowHeight = Math.max(
      ROW_MIN_HEIGHT,
      lineCount * CELL_LINE_HEIGHT + CELL_PADDING_Y * 2
    )

    if (y - rowHeight < CONTENT_BOTTOM) {
      startNewPage()
    }

    if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: CONTENT_LEFT,
        y: y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: ZEBRA_GRAY,
      })
    }

    let x = CONTENT_LEFT
    linesPerColumn.forEach((lines, colIndex) => {
      let lineY = y - CELL_PADDING_Y - CELL_TEXT_SIZE
      for (const line of lines) {
        let segmentX = x + CELL_PADDING_X
        for (const segment of line) {
          if (!segment.text) continue

          const font = segment.bold ? args.fonts.bold : args.fonts.regular
          const color = segment.color ? SEGMENT_COLOR[segment.color] : BLACK

          page.drawText(nfc(segment.text), {
            x: segmentX,
            y: lineY,
            size: CELL_TEXT_SIZE,
            font,
            color,
          })

          segmentX += font.widthOfTextAtSize(nfc(segment.text), CELL_TEXT_SIZE)
        }
        lineY -= CELL_LINE_HEIGHT
      }
      x += widths[colIndex]
    })

    drawColumnSeparators(page, widths, y, y - rowHeight)

    page.drawLine({
      start: { x: CONTENT_LEFT, y: y - rowHeight },
      end: { x: CONTENT_RIGHT, y: y - rowHeight },
      thickness: 0.4,
      color: BORDER_GRAY,
    })

    y -= rowHeight
  })

  drawTableFrame(page, segmentTop, y)

  return { page, y }
}

function getOnboardingColumns(
  includeDocuments: boolean
): ColumnDef<OnboardingReportRow>[] {
  const base: ColumnDef<OnboardingReportRow>[] = [
    {
      label: "Zaměstnanec",
      weight: 17,
      cell: (row) =>
        stackCell(
          row.fullName,
          row.personalNumber ? `č. ${row.personalNumber}` : null
        ),
    },
    {
      label: "Pozice / Odbor / Oddělení",
      weight: 20,
      wrap: true,
      cell: (row) => positionOrgCell(row),
    },
    {
      label: "Vedoucí",
      weight: 14,
      cell: (row) => stackCell(row.supervisorName, row.supervisorEmail),
    },
    {
      label: "Mentor",
      weight: 14,
      cell: (row) => stackCell(row.mentorName, row.mentorEmail),
    },
    {
      label: "Datum nástupu",
      weight: 10,
      cell: (row) => stackCell(formatDate(row.date), row.startTime),
    },
    {
      label: "Zkušební doba",
      weight: 20,
      richCell: (row) => {
        const lines = periodLines(row.probation)
        if (includeDocuments && row.documents) {
          lines.push(
            [{ text: "" }],
            ...probationEvalLines(
              row.documents.probationSent,
              row.documents.probationFilled
            )
          )
        }
        return lines
      },
    },
  ]

  if (!includeDocuments) return base

  return [
    ...base,
    {
      label: "Formuláře zaměstnance",
      weight: 22,
      richCell: (row) => onboardingFormsRich(row.documents),
    },
  ]
}

const ONBOARDING_CANCELLED_COLUMNS: ColumnDef<OnboardingReportRow>[] = [
  {
    label: "Zaměstnanec",
    weight: 18,
    cell: (row) =>
      stackCell(
        row.fullName,
        row.personalNumber ? `č. ${row.personalNumber}` : null
      ),
  },
  {
    label: "Pozice",
    weight: 15,
    wrap: true,
    cell: (row) => stackCell(row.positionName, row.positionNum),
  },
  {
    label: "Odbor / Oddělení",
    weight: 15,
    wrap: true,
    cell: (row) => stackCell(row.department, row.unitName),
  },
  {
    label: "Důvod zrušení",
    weight: 20,
    wrap: true,
    cell: (row) => row.cancelReason?.trim() || "—",
  },
  {
    label: "Zrušeno",
    weight: 15,
    cell: (row) => stackCell(formatDate(row.cancelledAt), row.cancelledBy),
  },
  {
    label: "Kontakt",
    weight: 17,
    cell: (row) => row.email?.trim() || "—",
  },
]

const OFFBOARDING_CANCELLED_COLUMNS: ColumnDef<OffboardingReportRow>[] = [
  {
    label: "Zaměstnanec",
    weight: 18,
    cell: (row) =>
      stackCell(
        row.fullName,
        row.personalNumber ? `č. ${row.personalNumber}` : null
      ),
  },
  {
    label: "Pozice",
    weight: 15,
    wrap: true,
    cell: (row) => stackCell(row.positionName, row.positionNum),
  },
  {
    label: "Odbor / Oddělení",
    weight: 15,
    wrap: true,
    cell: (row) => stackCell(row.department, row.unitName),
  },
  {
    label: "Důvod zrušení",
    weight: 20,
    wrap: true,
    cell: (row) => row.cancelReason?.trim() || "—",
  },
  {
    label: "Zrušeno",
    weight: 15,
    cell: (row) => stackCell(formatDate(row.cancelledAt), row.cancelledBy),
  },
  {
    label: "Kontakt",
    weight: 17,
    cell: (row) => stackCell(row.userEmail, row.userName),
  },
]

function getOffboardingColumns(
  includeDocuments: boolean
): ColumnDef<OffboardingReportRow>[] {
  const base: ColumnDef<OffboardingReportRow>[] = [
    {
      label: "Zaměstnanec",
      weight: 17,
      cell: (row) =>
        stackCell(
          row.fullName,
          row.personalNumber ? `č. ${row.personalNumber}` : null
        ),
    },
    {
      label: "Pozice",
      weight: 14,
      wrap: true,
      cell: (row) => stackCell(row.positionName, row.positionNum),
    },
    {
      label: "Odbor / Oddělení",
      weight: 14,
      wrap: true,
      cell: (row) => stackCell(row.department, row.unitName),
    },
    {
      label: "Datum odchodu",
      weight: 10,
      cell: (row) => formatDate(row.date),
    },
    {
      label: "Výpovědní doba",
      weight: 12,
      richCell: (row) => periodLines(row.notice),
    },
    {
      label: "Kontakt",
      weight: 13,
      cell: (row) => stackCell(row.userEmail, row.userName),
    },
  ]

  if (!includeDocuments) return base

  return [
    ...base,
    {
      label: "Výstupní list",
      weight: 20,
      richCell: (row) => offboardingDocumentsRich(row.documents),
    },
  ]
}

const CHANGE_COLUMNS: ColumnDef<ChangeReportRow>[] = [
  {
    label: "Zaměstnanec",
    weight: 17,
    cell: (row) =>
      stackCell(
        row.fullName,
        row.personalNumber ? `č. ${row.personalNumber}` : null
      ),
  },
  {
    label: "Aktuální zařazení",
    weight: 22,
    wrap: true,
    cell: (row) => changeValuesCell(row.oldValues),
  },
  {
    label: "Typ změny",
    weight: 14,
    cell: (row) => row.changeTypeLabel,
  },
  {
    label: "Účinnost změny",
    weight: 12,
    cell: (row) => formatDate(row.effectiveDate),
  },
  {
    label: "Nová hodnota",
    weight: 22,
    wrap: true,
    cell: (row) =>
      row.changeTypeLabel === "Mateřská dovolená"
        ? "Odchod na mateřskou dovolenou"
        : changeValuesCell(row.newValues),
  },
  {
    label: "Odeslání reportu",
    weight: 13,
    cell: (row) =>
      row.emailSentAt ? `Ano (${formatDate(row.emailSentAt)})` : "Ne",
  },
]

function sectionSortWeight(section: ReportSection): [number, number, string] {
  if (section.module === "nastup") {
    const statusWeight =
      section.status === "planned" ? 0 : section.status === "actual" ? 1 : 2
    return [0, statusWeight, section.month]
  }
  if (section.module === "odchod") {
    const statusWeight =
      section.status === "planned" ? 0 : section.status === "actual" ? 1 : 2
    return [1, statusWeight, section.month]
  }
  return [2, 0, section.month]
}

function sectionGroupKey(section: ReportSection): string {
  return section.module === "zmena"
    ? "zmena"
    : `${section.module}-${section.status}`
}

function groupTitle(section: ReportSection): string {
  if (section.module === "nastup") {
    const label =
      section.status === "planned"
        ? "Plánované"
        : section.status === "actual"
          ? "Skutečné"
          : "Neuskutečněné"
    return `Nástupy – ${label}`
  }
  if (section.module === "odchod") {
    const label =
      section.status === "planned"
        ? "Plánované"
        : section.status === "actual"
          ? "Skutečné"
          : "Neuskutečněné"
    return `Odchody – ${label}`
  }
  return "Zaměstnanecké změny"
}

export function buildReportTitle(sections: ReportSection[]): string {
  const modules = new Set(sections.map((section) => section.module))
  const labels: string[] = []

  if (modules.has("nastup")) labels.push("Nástupy")
  if (modules.has("odchod")) labels.push("Odchody")
  if (modules.has("zmena")) labels.push("Změny")

  if (labels.length === 0) return "Reporty"
  if (labels.length === 1) return `Reporty – ${labels[0]}`

  return `Reporty – ${labels.slice(0, -1).join(", ")} a ${labels[labels.length - 1]}`
}

export function buildReportMonthsLabel(sections: ReportSection[]): string {
  const months = Array.from(new Set(sections.map((section) => section.month)))
    .filter(Boolean)
    .sort()

  return months
    .map((month) => {
      const [year, monthNum] = month.split("-")
      return year && monthNum ? `${monthNum}/${year}` : month
    })
    .join(", ")
}

function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report"
  )
}

export function buildReportFilename(
  sections: ReportSection[],
  generatedAt: Date
): string {
  const title = buildReportTitle(sections).replace(/^Reporty\s*–\s*/, "")
  const slug = slugify(title)
  const stamp =
    `${generatedAt.getFullYear()}${pad2(generatedAt.getMonth() + 1)}${pad2(generatedAt.getDate())}` +
    `-${pad2(generatedAt.getHours())}${pad2(generatedAt.getMinutes())}${pad2(generatedAt.getSeconds())}`

  return `report-${slug}-${stamp}.pdf`
}

function ensureGroupSpace(args: {
  pdf: PDFDocument
  page: PDFPage
  fonts: PdfFontSet
  y: number
  needed: number
}) {
  if (args.y - args.needed >= CONTENT_BOTTOM) {
    return { page: args.page, y: args.y }
  }

  return { page: createPage(args.pdf), y: cv(48) }
}

export async function renderPdfReportBuffer(
  sections: ReportSection[],
  meta: { generatedByName: string; generatedAt: Date }
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const fonts = await loadPdfFonts(pdf)

  let page = createPage(pdf)
  let y = cv(50)

  page.drawText(nfc(buildReportTitle(sections)), {
    x: CONTENT_LEFT,
    y,
    size: TITLE_SIZE,
    font: fonts.bold,
    color: BLACK,
  })
  y -= 30

  const sorted = [...sections].sort((a, b) => {
    const [aModule, aStatus, aMonth] = sectionSortWeight(a)
    const [bModule, bStatus, bMonth] = sectionSortWeight(b)
    if (aModule !== bModule) return aModule - bModule
    if (aStatus !== bStatus) return aStatus - bStatus
    return aMonth.localeCompare(bMonth)
  })

  let currentGroupKey: string | null = null

  for (const section of sorted) {
    const groupKey = sectionGroupKey(section)

    if (groupKey !== currentGroupKey) {
      currentGroupKey = groupKey

      const ensured = ensureGroupSpace({ pdf, page, fonts, y, needed: 60 })
      page = ensured.page
      y = ensured.y

      page.drawText(nfc(groupTitle(section)), {
        x: CONTENT_LEFT,
        y,
        size: GROUP_TITLE_SIZE,
        font: fonts.bold,
        color: BLACK,
      })
      y -= 20
    }

    const ensuredMonth = ensureGroupSpace({ pdf, page, fonts, y, needed: 50 })
    page = ensuredMonth.page
    y = ensuredMonth.y

    const monthLabel = formatMonthLabel(section.month)

    page.drawText(
      nfc(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)),
      {
        x: CONTENT_LEFT,
        y,
        size: MONTH_TITLE_SIZE,
        font: fonts.bold,
        color: BLACK,
      }
    )
    y -= 16

    const continuationTitle = `${groupTitle(section)} – ${monthLabel} (pokračování)`

    if (section.module === "nastup") {
      const columns =
        section.status === "cancelled"
          ? ONBOARDING_CANCELLED_COLUMNS
          : getOnboardingColumns(section.includeDocuments)

      const result = drawTable({
        pdf,
        page,
        fonts,
        y,
        columns,
        rows: section.rows,
        continuationTitle,
      })
      page = result.page
      y = result.y
    } else if (section.module === "odchod") {
      const columns =
        section.status === "cancelled"
          ? OFFBOARDING_CANCELLED_COLUMNS
          : getOffboardingColumns(section.includeDocuments)

      const result = drawTable({
        pdf,
        page,
        fonts,
        y,
        columns,
        rows: section.rows,
        continuationTitle,
      })
      page = result.page
      y = result.y
    } else {
      const result = drawTable({
        pdf,
        page,
        fonts,
        y,
        columns: CHANGE_COLUMNS,
        rows: section.rows,
        continuationTitle,
      })
      page = result.page
      y = result.y
    }

    y -= 22
  }

  const footerText = nfc(
    `Vygeneroval: ${meta.generatedByName} · ${formatDateTime(meta.generatedAt.toISOString())}`
  )

  for (const footerPage of pdf.getPages()) {
    footerPage.drawLine({
      start: { x: CONTENT_LEFT, y: FOOTER_Y + 12 },
      end: { x: CONTENT_RIGHT, y: FOOTER_Y + 12 },
      thickness: 0.4,
      color: BORDER_GRAY,
    })
    footerPage.drawText(footerText, {
      x: CONTENT_LEFT,
      y: FOOTER_Y,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    })
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
