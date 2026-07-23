import { PDFDocument, rgb, type PDFPage } from "pdf-lib"

import { loadPdfFonts, type PdfFontSet } from "@/lib/pdf-fonts"
import type {
  ChangesByTypeMonthPoint,
  CustomViewResult,
  KpiSummary,
  MonthlyFlowPoint,
  ProcessHealth,
  StatDatum,
} from "@/lib/statistics/types"

export const runtime = "nodejs"

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.92
const MARGIN = 40
const CONTENT_LEFT = MARGIN
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT
const CONTENT_BOTTOM = 50
const FOOTER_Y = 24

const BLACK = rgb(0, 0, 0)
const MUTED = rgb(0.35, 0.35, 0.35)
const BORDER_GRAY = rgb(0.6, 0.6, 0.6)
const GREEN = rgb(0, 0.518, 0.486)
const AMBER = rgb(0.85, 0.47, 0.02)
const BLUE = rgb(0.11, 0.29, 0.63)
const ZEBRA_GRAY = rgb(0.95, 0.95, 0.95)

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value: string) => value.normalize("NFC")
const pad2 = (n: number) => String(n).padStart(2, "0")

const MONTH_NAMES = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
]

function formatMonth(month: string) {
  const [, m] = month.split("-")
  const index = Number(m) - 1
  return MONTH_NAMES[index] ?? month
}

function formatDateTime(date: Date): string {
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} ${time}`
}

function createPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

export type StatisticsPdfContent = {
  includeKpis: boolean
  includeMonthlyFlow: boolean
  includeDepartmentFluctuation: boolean
  includeChangesByType: boolean
  includeProcessHealth: boolean
  includeDataTable: boolean
  customView?: {
    label: string
    result: CustomViewResult
  } | null
}

type Ctx = {
  pdf: PDFDocument
  fonts: PdfFontSet
  page: PDFPage
  y: number
}

function ensureSpace(ctx: Ctx, needed: number): Ctx {
  if (ctx.y - needed >= CONTENT_BOTTOM) return ctx
  return { ...ctx, page: createPage(ctx.pdf), y: cv(48) }
}

function drawSectionTitle(ctx: Ctx, title: string): Ctx {
  const next = ensureSpace(ctx, 40)
  next.page.drawText(nfc(title), {
    x: CONTENT_LEFT,
    y: next.y,
    size: 13,
    font: next.fonts.bold,
    color: BLACK,
  })
  return { ...next, y: next.y - 20 }
}

function drawKpiGrid(ctx: Ctx, items: { label: string; value: string }[]): Ctx {
  const columns = 3
  const gap = 10
  const boxWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns
  const boxHeight = 56
  const rows = Math.ceil(items.length / columns)
  const next = ensureSpace(ctx, rows * (boxHeight + gap) + 10)

  items.forEach((item, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const x = CONTENT_LEFT + col * (boxWidth + gap)
    const boxTop = next.y - row * (boxHeight + gap)

    next.page.drawRectangle({
      x,
      y: boxTop - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderWidth: 0.6,
      borderColor: BORDER_GRAY,
      color: rgb(0.97, 0.98, 0.98),
    })

    next.page.drawText(nfc(item.label), {
      x: x + 8,
      y: boxTop - 18,
      size: 8,
      font: next.fonts.regular,
      color: MUTED,
      maxWidth: boxWidth - 16,
    })

    next.page.drawText(nfc(item.value), {
      x: x + 8,
      y: boxTop - 40,
      size: 15,
      font: next.fonts.bold,
      color: GREEN,
    })
  })

  return { ...next, y: next.y - rows * (boxHeight + gap) - 12 }
}

function drawLegend(
  ctx: Ctx,
  entries: { label: string; color: ReturnType<typeof rgb> }[]
): Ctx {
  let x = CONTENT_LEFT
  const y = ctx.y

  for (const entry of entries) {
    ctx.page.drawRectangle({
      x,
      y: y - 8,
      width: 8,
      height: 8,
      color: entry.color,
    })
    ctx.page.drawText(nfc(entry.label), {
      x: x + 12,
      y: y - 7,
      size: 8,
      font: ctx.fonts.regular,
      color: MUTED,
    })
    x += ctx.fonts.regular.widthOfTextAtSize(entry.label, 8) + 34
  }

  return { ...ctx, y: y - 18 }
}

function drawGroupedBarChart(
  ctx: Ctx,
  points: { label: string; values: number[] }[],
  colors: ReturnType<typeof rgb>[],
  chartHeight = 160
): Ctx {
  const next = ensureSpace(ctx, chartHeight + 40)
  const top = next.y
  const bottom = top - chartHeight
  const maxValue = Math.max(1, ...points.flatMap((p) => p.values))

  next.page.drawLine({
    start: { x: CONTENT_LEFT, y: bottom },
    end: { x: CONTENT_RIGHT, y: bottom },
    thickness: 0.6,
    color: BORDER_GRAY,
  })

  const groupWidth = CONTENT_WIDTH / Math.max(1, points.length)
  const barGap = 3
  const seriesCount = colors.length
  const barWidth = Math.max(
    2,
    (groupWidth - barGap * 2) / Math.max(1, seriesCount)
  )

  points.forEach((point, pointIndex) => {
    const groupX = CONTENT_LEFT + pointIndex * groupWidth + barGap
    point.values.forEach((value, seriesIndex) => {
      const barHeight = (value / maxValue) * (chartHeight - 20)
      next.page.drawRectangle({
        x: groupX + seriesIndex * barWidth,
        y: bottom,
        width: Math.max(1, barWidth - 1),
        height: Math.max(0, barHeight),
        color: colors[seriesIndex % colors.length],
      })
    })

    const label = point.label
    const labelWidth = next.fonts.regular.widthOfTextAtSize(label, 7)
    next.page.drawText(nfc(label), {
      x: groupX + groupWidth / 2 - barGap - labelWidth / 2,
      y: bottom - 12,
      size: 7,
      font: next.fonts.regular,
      color: MUTED,
    })
  })

  return { ...next, y: bottom - 26 }
}

function drawStackedBarChart(
  ctx: Ctx,
  points: { label: string; segments: number[] }[],
  colors: ReturnType<typeof rgb>[],
  chartHeight = 160
): Ctx {
  const next = ensureSpace(ctx, chartHeight + 40)
  const top = next.y
  const bottom = top - chartHeight
  const totals = points.map((p) => p.segments.reduce((a, b) => a + b, 0))
  const maxValue = Math.max(1, ...totals)

  next.page.drawLine({
    start: { x: CONTENT_LEFT, y: bottom },
    end: { x: CONTENT_RIGHT, y: bottom },
    thickness: 0.6,
    color: BORDER_GRAY,
  })

  const groupWidth = CONTENT_WIDTH / Math.max(1, points.length)
  const barWidth = Math.max(4, groupWidth - 10)

  points.forEach((point, index) => {
    const x = CONTENT_LEFT + index * groupWidth + (groupWidth - barWidth) / 2
    let stackY = bottom

    point.segments.forEach((value, segmentIndex) => {
      const segmentHeight = (value / maxValue) * (chartHeight - 20)
      next.page.drawRectangle({
        x,
        y: stackY,
        width: barWidth,
        height: Math.max(0, segmentHeight),
        color: colors[segmentIndex % colors.length],
      })
      stackY += segmentHeight
    })

    const label = point.label
    const labelWidth = next.fonts.regular.widthOfTextAtSize(label, 7)
    next.page.drawText(nfc(label), {
      x: x + barWidth / 2 - labelWidth / 2,
      y: bottom - 12,
      size: 7,
      font: next.fonts.regular,
      color: MUTED,
    })
  })

  return { ...next, y: bottom - 26 }
}

function drawHorizontalBarChart(ctx: Ctx, data: StatDatum[]): Ctx {
  const rowHeight = 18
  const chartHeight = Math.max(60, data.length * rowHeight + 10)
  const next = ensureSpace(ctx, chartHeight + 20)

  const maxValue = Math.max(1, ...data.map((d) => d.value))
  const labelWidth = 140
  const barAreaWidth = CONTENT_WIDTH - labelWidth - 40

  data.forEach((datum, index) => {
    const rowTop = next.y - index * rowHeight
    const barWidth = (datum.value / maxValue) * barAreaWidth

    next.page.drawText(nfc(datum.label), {
      x: CONTENT_LEFT,
      y: rowTop - 12,
      size: 8,
      font: next.fonts.regular,
      color: BLACK,
      maxWidth: labelWidth - 6,
    })

    next.page.drawRectangle({
      x: CONTENT_LEFT + labelWidth,
      y: rowTop - 14,
      width: Math.max(1, barWidth),
      height: 10,
      color: AMBER,
    })

    next.page.drawText(String(datum.value), {
      x: CONTENT_LEFT + labelWidth + barWidth + 4,
      y: rowTop - 12,
      size: 8,
      font: next.fonts.regular,
      color: MUTED,
    })
  })

  return { ...next, y: next.y - data.length * rowHeight - 14 }
}

function drawSimpleTable(ctx: Ctx, columns: string[], rows: string[][]): Ctx {
  const colWidth = CONTENT_WIDTH / columns.length
  const rowHeight = 16
  let next = ctx

  next = ensureSpace(next, rowHeight + 10)
  next.page.drawRectangle({
    x: CONTENT_LEFT,
    y: next.y - rowHeight,
    width: CONTENT_WIDTH,
    height: rowHeight,
    color: rgb(0.88, 0.9, 0.9),
  })
  columns.forEach((col, index) => {
    next.page.drawText(nfc(col), {
      x: CONTENT_LEFT + index * colWidth + 4,
      y: next.y - rowHeight + 5,
      size: 8,
      font: next.fonts.bold,
      color: BLACK,
    })
  })
  next = { ...next, y: next.y - rowHeight }

  rows.forEach((row, rowIndex) => {
    next = ensureSpace(next, rowHeight)
    if (rowIndex % 2 === 1) {
      next.page.drawRectangle({
        x: CONTENT_LEFT,
        y: next.y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: ZEBRA_GRAY,
      })
    }
    row.forEach((cell, colIndex) => {
      next.page.drawText(nfc(cell), {
        x: CONTENT_LEFT + colIndex * colWidth + 4,
        y: next.y - rowHeight + 5,
        size: 8,
        font: next.fonts.regular,
        color: BLACK,
      })
    })
    next = { ...next, y: next.y - rowHeight }
  })

  return { ...next, y: next.y - 14 }
}

export function buildStatisticsReportTitle(
  year: number,
  fromMonth?: number,
  toMonth?: number
): string {
  if (!fromMonth && !toMonth) return `Statistiky – ${year}`
  const fromLabel = fromMonth
    ? formatMonth(`${year}-${String(fromMonth).padStart(2, "0")}`)
    : "začátek"
  const toLabel = toMonth
    ? formatMonth(`${year}-${String(toMonth).padStart(2, "0")}`)
    : "konec"
  return `Statistiky – ${year} (${fromLabel} – ${toLabel})`
}

export async function renderStatisticsPdfBuffer(args: {
  kpis: KpiSummary
  monthlyFlow: MonthlyFlowPoint[]
  departmentFluctuation: StatDatum[]
  changesByTypeMonthly: ChangesByTypeMonthPoint[]
  processHealth: ProcessHealth
  content: StatisticsPdfContent
  meta: {
    year: number
    fromMonth?: number
    toMonth?: number
    generatedByName: string
    generatedAt: Date
  }
}): Promise<Buffer> {
  const {
    kpis,
    monthlyFlow,
    departmentFluctuation,
    changesByTypeMonthly,
    processHealth,
    content,
    meta,
  } = args

  const pdf = await PDFDocument.create()
  const fonts = await loadPdfFonts(pdf)

  let ctx: Ctx = { pdf, fonts, page: createPage(pdf), y: cv(50) }

  const title = buildStatisticsReportTitle(
    meta.year,
    meta.fromMonth,
    meta.toMonth
  )
  ctx.page.drawText(nfc(title), {
    x: CONTENT_LEFT,
    y: ctx.y,
    size: 17,
    font: fonts.bold,
    color: BLACK,
  })
  ctx = { ...ctx, y: ctx.y - 30 }

  if (content.includeKpis) {
    ctx = drawSectionTitle(ctx, "Hlavní ukazatele")
    ctx = drawKpiGrid(ctx, [
      { label: "Nástupy celkem", value: String(kpis.onboardingsTotal) },
      { label: "Odchody celkem", value: String(kpis.offboardingsTotal) },
      {
        label: "Čistý přírůstek",
        value: (kpis.netGrowth > 0 ? "+" : "") + kpis.netGrowth,
      },
      {
        label: "Aktuální stav zaměstnanců",
        value: String(kpis.currentHeadcount),
      },
      {
        label: "Odchody ve zkušební době",
        value: `${kpis.offboardingsDuringProbationPercent} %`,
      },
      {
        label: "Neuskutečněné nástupy",
        value: String(kpis.onboardingsCancelledTotal),
      },
    ])
  }

  if (content.includeMonthlyFlow && monthlyFlow.length > 0) {
    ctx = drawSectionTitle(ctx, "Nástupy a odchody po měsících")
    ctx = drawLegend(ctx, [
      { label: "Nástupy", color: GREEN },
      { label: "Odchody", color: AMBER },
    ])
    ctx = drawGroupedBarChart(
      ctx,
      monthlyFlow.map((p) => ({
        label: formatMonth(p.month),
        values: [p.onboardings, p.offboardings],
      })),
      [GREEN, AMBER]
    )
  }

  if (
    content.includeDepartmentFluctuation &&
    departmentFluctuation.length > 0
  ) {
    ctx = drawSectionTitle(ctx, "Fluktuace podle odboru")
    ctx = drawHorizontalBarChart(ctx, departmentFluctuation)
  }

  if (content.includeChangesByType && changesByTypeMonthly.length > 0) {
    ctx = drawSectionTitle(ctx, "Změny podle typu po měsících")
    ctx = drawLegend(ctx, [
      { label: "Pozice", color: GREEN },
      { label: "Jméno", color: BLUE },
      { label: "Jméno i pozice", color: AMBER },
    ])
    ctx = drawStackedBarChart(
      ctx,
      changesByTypeMonthly.map((p) => ({
        label: formatMonth(p.month),
        segments: [p.POSITION, p.NAME, p.NAME_AND_POSITION],
      })),
      [GREEN, BLUE, AMBER]
    )
  }

  if (content.includeProcessHealth) {
    ctx = drawSectionTitle(ctx, "Zdraví procesu")
    ctx = drawKpiGrid(ctx, [
      {
        label: "Formuláře vyplněné včas",
        value: `${processHealth.documentsCompletedOnTimePercent} %`,
      },
      {
        label: "Dokončená hodnocení zkušebky",
        value: `${processHealth.probationEvaluationsCompletedPercent} %`,
      },
      {
        label: "Průměrná doba hodnocení",
        value:
          processHealth.probationEvaluationsAvgDays != null
            ? `${processHealth.probationEvaluationsAvgDays} dní`
            : "—",
      },
      {
        label: "Výstupní listy podepsané všemi",
        value: `${processHealth.exitChecklistsFullySignedPercent} %`,
      },
      {
        label: "Odchylka nástupu",
        value:
          processHealth.avgStartDeviationDays != null
            ? `${processHealth.avgStartDeviationDays} dní`
            : "—",
      },
      {
        label: "Odchylka odchodu",
        value:
          processHealth.avgEndDeviationDays != null
            ? `${processHealth.avgEndDeviationDays} dní`
            : "—",
      },
    ])
  }

  if (content.includeDataTable && monthlyFlow.length > 0) {
    ctx = drawSectionTitle(ctx, "Podkladová tabulka")
    ctx = drawSimpleTable(
      ctx,
      ["Měsíc", "Nástupy", "Odchody", "Stav zaměstnanců"],
      monthlyFlow.map((p) => [
        formatMonth(p.month),
        String(p.onboardings),
        String(p.offboardings),
        String(p.headcount),
      ])
    )
  }

  if (content.customView && content.customView.result.data.length > 0) {
    ctx = drawSectionTitle(ctx, `Vlastní pohled – ${content.customView.label}`)
    ctx = drawSimpleTable(
      ctx,
      ["Kategorie", "Hodnota"],
      content.customView.result.data.map((d) => [d.label, String(d.value)])
    )
  }

  const footerText = nfc(
    `Vygeneroval: ${meta.generatedByName} · ${formatDateTime(meta.generatedAt)}`
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

export function buildStatisticsReportFilename(
  year: number,
  generatedAt: Date
): string {
  const stamp =
    `${generatedAt.getFullYear()}${pad2(generatedAt.getMonth() + 1)}${pad2(generatedAt.getDate())}` +
    `-${pad2(generatedAt.getHours())}${pad2(generatedAt.getMinutes())}${pad2(generatedAt.getSeconds())}`
  return `statistiky-${year}-${stamp}.pdf`
}
