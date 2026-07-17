import fs from "fs/promises"
import path from "path"

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { loadPdfFonts, type PdfFontSet } from "@/lib/pdf-fonts"

export const runtime = "nodejs"

const PAGE_HEIGHT = 841.92
const PAGE_WIDTH = 595.28

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value?: string | null) => (value ?? "").normalize("NFC")

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "assets",
  "docs",
  "sablona-zkusebni-doba.pdf"
)

const HEADER_VALUE_X = 292
const HEADER_VALUE_MAX_WIDTH = 244

const CONTENT_LEFT = 54
const CONTENT_RIGHT = 543
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT

const GENERATED_TEXT_SIZE = 10
const GENERATED_LINE_HEIGHT = 12.5

const BLACK = rgb(0, 0, 0)

type ProbationPdfPayload = {
  request: {
    id: number
    status: string
    formType: string
    probationEnd?: string | null
    completedAt?: string | null

    supervisorName?: string | null
    supervisorEmail?: string | null
    supervisorPosition?: string | null
    supervisorDepartment?: string | null
    supervisorUnitName?: string | null

    evaluatorName?: string | null
    evaluatorEmail?: string | null
    evaluatorPosition?: string | null
    evaluatorDepartment?: string | null
    evaluatorUnitName?: string | null

    recommendation?: boolean | string | null
    data?: unknown
  }
  onboarding: {
    id: number
    fullName: string
    personalNumber?: string | null
    positionName?: string | null
    department?: string | null
    unitName?: string | null
    actualStart?: string | null
    plannedStart?: string | null
    probationEnd?: string | null
    earlyExitNote?: string | null
  }
}

function cleanText(value?: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function joinInline(
  values: Array<string | null | undefined>,
  separator = " • "
) {
  return values.map(cleanText).filter(Boolean).join(separator)
}

function normalizeRecommendation(value: unknown): "yes" | "no" | "" {
  if (value === true || value === "yes") return "yes"
  if (value === false || value === "no") return "no"
  return ""
}

function recommendationLabel(value: unknown) {
  const normalized = normalizeRecommendation(value)

  if (normalized === "yes")
    return "ANO – doporučuji pokračování pracovního poměru"
  if (normalized === "no")
    return "NE – nedoporučuji pokračování pracovního poměru"

  return "Bez stanoviska"
}

function formatCzDate(value?: string | Date | null): string {
  if (!value) return ""

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.${date.getFullYear()}`
}

function formatCzDateTime(value?: string | Date | null): string {
  if (!value) return ""

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ""

  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.${date.getFullYear()} ${String(date.getHours()).padStart(
    2,
    "0"
  )}:${String(date.getMinutes()).padStart(2, "0")}`
}

function getSignatureData(data: Record<string, unknown>) {
  const signature = asRecord(data.signature)

  return {
    signedByName: cleanText(signature.signedByName),
    signedByEmail: cleanText(signature.signedByEmail),
    signedAt: cleanText(signature.signedAt),
    signedOnBehalf: signature.signedOnBehalf === true,
  }
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string | null | undefined,
  x: number,
  y: number,
  size = GENERATED_TEXT_SIZE
) {
  const normalized = nfc(cleanText(text))
  if (!normalized) return

  page.drawText(normalized, {
    x,
    y,
    size,
    font,
    color: BLACK,
  })
}

function drawTextFitted(args: {
  page: PDFPage
  font: PDFFont
  text?: string | null
  x: number
  y: number
  maxWidth: number
  baseSize?: number
  minSize?: number
}) {
  const normalized = nfc(cleanText(args.text))
  if (!normalized) return

  let size = args.baseSize ?? GENERATED_TEXT_SIZE
  const minSize = args.minSize ?? 6.2
  const width = args.font.widthOfTextAtSize(normalized, size)

  if (width > args.maxWidth) {
    size = Math.max(minSize, (args.maxWidth / width) * size)
  }

  args.page.drawText(normalized, {
    x: args.x,
    y: args.y,
    size,
    font: args.font,
    color: BLACK,
  })
}

function wrapSingleLine(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const normalized = cleanText(text)
  if (!normalized) return []

  const words = normalized.split(" ")
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
      current = word
      continue
    }

    lines.push(word)
    current = ""
  }

  if (current) lines.push(current)

  return lines
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const paragraphs = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")

  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const wrapped = wrapSingleLine(paragraph, font, fontSize, maxWidth)

    if (wrapped.length === 0) {
      if (lines.length > 0) lines.push("")
      continue
    }

    lines.push(...wrapped)
  }

  return lines
}

function drawParagraph(args: {
  page: PDFPage
  font: PDFFont
  text: string
  x: number
  y: number
  maxWidth: number
  fontSize?: number
  lineHeight?: number
}) {
  const fontSize = args.fontSize ?? GENERATED_TEXT_SIZE
  const lineHeight = args.lineHeight ?? GENERATED_LINE_HEIGHT
  const lines = wrapText(args.text, args.font, fontSize, args.maxWidth)

  let y = args.y

  for (const line of lines) {
    if (line) {
      drawText(args.page, args.font, line, args.x, y, fontSize)
    }
    y -= lineHeight
  }

  return y
}

function createBlankPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

function drawPageTitle(page: PDFPage, fonts: PdfFontSet, title: string) {
  drawText(page, fonts.bold, title, CONTENT_LEFT, cv(54), 13)
}

function ensureSpace(args: {
  pdf: PDFDocument
  page: PDFPage
  fonts: PdfFontSet
  y: number
  needed: number
}) {
  if (args.y - args.needed >= 48) {
    return {
      page: args.page,
      y: args.y,
    }
  }

  const page = createBlankPage(args.pdf)
  drawPageTitle(page, args.fonts, "Vyhodnocení zkušební doby")

  return {
    page,
    y: cv(84),
  }
}

function drawSection(args: {
  pdf: PDFDocument
  page: PDFPage
  fonts: PdfFontSet
  y: number
  title: string
  text: string
}) {
  let activePage = args.page
  let y = args.y

  const text = args.text || "—"
  const lines = wrapText(
    text,
    args.fonts.regular,
    GENERATED_TEXT_SIZE,
    CONTENT_WIDTH
  )

  const neededHeight = 26 + Math.max(1, lines.length) * GENERATED_LINE_HEIGHT

  const ensured = ensureSpace({
    pdf: args.pdf,
    page: activePage,
    fonts: args.fonts,
    y,
    needed: neededHeight,
  })

  activePage = ensured.page
  y = ensured.y

  drawText(activePage, args.fonts.bold, args.title, CONTENT_LEFT, y, 11)
  y -= 16

  y = drawParagraph({
    page: activePage,
    font: args.fonts.regular,
    text,
    x: CONTENT_LEFT,
    y,
    maxWidth: CONTENT_WIDTH,
  })

  y -= 12

  return {
    page: activePage,
    y,
  }
}

function drawHeader(
  page: PDFPage,
  fonts: PdfFontSet,
  payload: ProbationPdfPayload
) {
  const data = asRecord(payload.request.data)

  const employmentStart =
    payload.onboarding.actualStart ?? payload.onboarding.plannedStart ?? null

  const probationEnd =
    payload.request.probationEnd ?? payload.onboarding.probationEnd ?? null

  const supervisorName =
    cleanText(payload.request.supervisorName) ||
    cleanText(payload.request.evaluatorName) ||
    cleanText(data.evaluatorName) ||
    "—"

  const supervisorPosition =
    cleanText(payload.request.supervisorPosition) ||
    cleanText(payload.request.evaluatorPosition)

  const supervisorOrg = joinInline(
    [
      payload.request.supervisorDepartment ||
        payload.request.evaluatorDepartment,
      payload.request.supervisorUnitName || payload.request.evaluatorUnitName,
    ],
    " / "
  )

  drawTextFitted({
    page,
    font: fonts.bold,
    text: payload.onboarding.fullName || "—",
    x: HEADER_VALUE_X,
    y: cv(158.2),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: GENERATED_TEXT_SIZE,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: payload.onboarding.personalNumber || "—",
    x: HEADER_VALUE_X,
    y: cv(179.8),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: GENERATED_TEXT_SIZE,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: payload.onboarding.positionName || "—",
    x: HEADER_VALUE_X,
    y: cv(201.4),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: GENERATED_TEXT_SIZE,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: payload.onboarding.department || "—",
    x: HEADER_VALUE_X,
    y: cv(223),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: GENERATED_TEXT_SIZE,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: payload.onboarding.unitName || "—",
    x: HEADER_VALUE_X,
    y: cv(244.6),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: GENERATED_TEXT_SIZE,
  })

  drawText(
    page,
    fonts.regular,
    formatCzDate(employmentStart) || "—",
    HEADER_VALUE_X,
    cv(266.2)
  )

  drawText(
    page,
    fonts.regular,
    formatCzDate(probationEnd) || "—",
    HEADER_VALUE_X,
    cv(287.8)
  )

  drawTextFitted({
    page,
    font: fonts.bold,
    text: supervisorName,
    x: HEADER_VALUE_X,
    y: cv(316.5),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: 9.5,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: supervisorPosition || "—",
    x: HEADER_VALUE_X,
    y: cv(330.5),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: 9.2,
  })

  drawTextFitted({
    page,
    font: fonts.regular,
    text: supervisorOrg || "—",
    x: HEADER_VALUE_X,
    y: cv(344.5),
    maxWidth: HEADER_VALUE_MAX_WIDTH,
    baseSize: 9.2,
  })
}

function drawSignatureBlock(args: {
  pdf: PDFDocument
  page: PDFPage
  fonts: PdfFontSet
  y: number
  payload: ProbationPdfPayload
}) {
  const data = asRecord(args.payload.request.data)
  const signature = getSignatureData(data)

  let activePage = args.page
  let y = args.y

  const evaluatorName =
    signature.signedByName ||
    cleanText(args.payload.request.evaluatorName) ||
    cleanText(args.payload.request.supervisorName) ||
    "—"

  const signedAt = formatCzDateTime(signature.signedAt)
  const neededHeight = 58

  const ensured = ensureSpace({
    pdf: args.pdf,
    page: activePage,
    fonts: args.fonts,
    y,
    needed: neededHeight,
  })

  activePage = ensured.page
  y = ensured.y

  drawText(
    activePage,
    args.fonts.bold,
    "Podpis hodnotitele",
    CONTENT_LEFT,
    y,
    11
  )

  y -= 18

  drawText(activePage, args.fonts.regular, evaluatorName, CONTENT_LEFT, y, 9)

  y -= 12

  if (signedAt) {
    drawText(activePage, args.fonts.regular, signedAt, CONTENT_LEFT, y, 9)

    y -= 12
  }

  drawText(
    activePage,
    args.fonts.regular,
    "Elektronicky podepsáno v aplikaci On-Off-Boarding ÚMČ Praha 6.",
    CONTENT_LEFT,
    y,
    7
  )

  y -= 20

  return {
    page: activePage,
    y,
  }
}

export async function renderProbationEvaluationPdfBuffer(
  payload: ProbationPdfPayload
): Promise<Buffer> {
  const templateBytes = await fs.readFile(TEMPLATE_PATH)

  const pdf = await PDFDocument.load(templateBytes)
  const fonts = await loadPdfFonts(pdf)

  const page = pdf.getPage(0)
  drawHeader(page, fonts, payload)

  const data = asRecord(payload.request.data)

  let activePage = page
  let y = cv(382)

  const recommendationValue =
    payload.request.recommendation ?? data.recommendation

  const reason = cleanText(data.reason) || cleanText(data.reasonIfNo)

  const recommendationText = [
    recommendationLabel(recommendationValue),
    reason ? `Důvod:\n${reason}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  if (payload.onboarding.earlyExitNote) {
    const noteResult = drawSection({
      pdf,
      page: activePage,
      fonts,
      y,
      title: "Poznámka k zaměstnaneckému poměru",
      text: payload.onboarding.earlyExitNote,
    })

    activePage = noteResult.page
    y = noteResult.y
  }

  const sections = [
    {
      title: "1. Pracovní výsledky",
      text: cleanText(data.workResults),
    },
    {
      title: "2. Pracovní chování",
      text: cleanText(data.workBehavior),
    },
    {
      title: "3. Sociální chování a spolupráce",
      text: cleanText(data.socialSkills),
    },
    {
      title: "4. Dovednosti, znalosti a vlastnosti",
      text: cleanText(data.skillsKnowledgeTraits),
    },
    {
      title: "Doporučení k pokračování pracovního poměru",
      text: recommendationText,
    },
  ]

  for (const section of sections) {
    const result = drawSection({
      pdf,
      page: activePage,
      fonts,
      y,
      title: section.title,
      text: section.text,
    })

    activePage = result.page
    y = result.y
  }

  const signatureResult = drawSignatureBlock({
    pdf,
    page: activePage,
    fonts,
    y,
    payload,
  })

  activePage = signatureResult.page
  y = signatureResult.y

  if (y > 48) {
    drawText(
      activePage,
      fonts.regular,
      `Vygenerováno: ${formatCzDateTime(new Date())}`,
      CONTENT_LEFT,
      32,
      8
    )
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
