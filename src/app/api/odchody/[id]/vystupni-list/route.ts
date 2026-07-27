import fs from "fs/promises"
import path from "path"

import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import type {
  ExitChecklistData,
  ExitChecklistSignatureValue,
  HandoverAgendaData,
} from "@/types/exit-checklist"

import { prisma } from "@/lib/db"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAccessInternalApp, canReadExitChecklist } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_HEIGHT = 841.92
const PAGE_WIDTH = 595.28

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value?: string | null) => (value ?? "").normalize("NFC")

const SECTION_LEFT = 54
const SECTION_RIGHT = 543
const SECTION_WIDTH = SECTION_RIGHT - SECTION_LEFT

const ASSET_TABLE_LEFT = 54
const ASSET_TABLE_RIGHT = 543
const ASSET_TABLE_SPLIT = 322
const ASSET_TABLE_HEADER_HEIGHT = 18
const ASSET_TABLE_ROW_HEIGHT = 18
const DRAW_ASSET_TABLE_HEADER_TEXT = true

const TABLE_RESOLUTION_CENTER_X = 387
const TABLE_SIGNATURE_X = 419
const TABLE_SIGNATURE_MAX_WIDTH = 112

const HEADER_VALUE_X = 292
const HEADER_VALUE_MAX_WIDTH = 244

const GENERATED_TEXT_SIZE = 10
const GENERATED_LINE_HEIGHT = 12.2

const SIGNATURE_NAME_SIZE = 10
const SIGNATURE_DATE_SIZE = 8.2
const SIGNATURE_NOTE_SIZE = 5.2
const SIGNATURE_LINE_HEIGHT = 10.2

const TABLE_SIGNATURE_NAME_SIZE = 9
const TABLE_SIGNATURE_DATE_SIZE = 7.8
const TABLE_SIGNATURE_NOTE_SIZE = 4.9
const TABLE_SIGNATURE_LINE_HEIGHT = 7.9

const SIGNATURE_NOTE_TEXT =
  "Elektronicky podepsáno v aplikaci On-Off-Boarding ÚMČ Praha 6."

const HANDOVER_TITLE_SIZE = 10.6
const HANDOVER_BODY_SIZE = GENERATED_TEXT_SIZE
const HANDOVER_BODY_LINE_HEIGHT = GENERATED_LINE_HEIGHT
const HANDOVER_RECIPIENT_DETAIL_INDENT = 14

const ARIAL_FONT_DIR = path.join(process.cwd(), "src", "fonts")

const ARIAL_REGULAR_FONT_CANDIDATES = [
  path.join(ARIAL_FONT_DIR, "Arial.ttf"),
  path.join(ARIAL_FONT_DIR, "arial.ttf"),
]

const ARIAL_BOLD_FONT_CANDIDATES = [
  path.join(ARIAL_FONT_DIR, "Arial-Bold.ttf"),
  path.join(ARIAL_FONT_DIR, "arialbd.ttf"),
  path.join(ARIAL_FONT_DIR, "ArialBold.ttf"),
]

type FontSet = {
  regular: PDFFont
  bold: PDFFont
}

async function getChecklistById(
  id: number,
  cookie: string | null
): Promise<ExitChecklistData> {
  const base = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL
  if (!base) throw new Error("Chybí AUTH_URL nebo NEXT_PUBLIC_APP_URL.")

  const res = await fetch(`${base}/api/odchody/${id}/exit-checklist`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  })

  if (!res.ok) throw new Error(`Nelze načíst výstupní list (${res.status}).`)

  const json = await res.json()
  if (!json.data) throw new Error("Chybí data výstupního listu.")

  return json.data as ExitChecklistData
}

async function readFirstExistingFile(
  paths: string[]
): Promise<Uint8Array | null> {
  for (const filePath of paths) {
    try {
      return await fs.readFile(filePath)
    } catch {}
  }

  return null
}

async function readRequiredFont(paths: string[], label: string) {
  const bytes = await readFirstExistingFile(paths)

  if (!bytes) {
    throw new Error(
      `Chybí font ${label}. Vložte soubor do src/fonts, např. src/fonts/Arial.ttf a src/fonts/Arial-Bold.ttf.`
    )
  }

  return bytes
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = u8
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

function cleanText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function formatCzDate(iso?: string | null): string {
  if (!iso) return ""

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""

  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${d.getFullYear()}`
}

function formatCzDateTime(iso?: string | null): string {
  if (!iso) return ""

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""

  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(
    2,
    "0"
  )}:${String(d.getMinutes()).padStart(2, "0")}`
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string | null | undefined,
  x: number,
  y: number,
  size = 10
) {
  if (!text) return
  page.drawText(nfc(text), { x, y, size, font })
}

function drawTextFitted(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  minSize = 5.2
) {
  const normalized = nfc(cleanText(text))
  if (!normalized) return

  let size = baseSize
  const width = font.widthOfTextAtSize(normalized, size)

  if (width > maxWidth) {
    size = Math.max(minSize, (maxWidth / width) * size)
  }

  page.drawText(normalized, { x, y, size, font })
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  size: number
) {
  const normalized = nfc(text)
  const width = font.widthOfTextAtSize(normalized, size)

  page.drawText(normalized, {
    x: centerX - width / 2,
    y,
    size,
    font,
  })
}

function wrapText(
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

function drawParagraph(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize = GENERATED_TEXT_SIZE,
  lineHeight = GENERATED_LINE_HEIGHT
): number {
  const lines = wrapText(text, font, fontSize, maxWidth)

  for (const line of lines) {
    drawText(page, font, line, x, y, fontSize)
    y -= lineHeight
  }

  return y
}

function drawBoldText(
  page: PDFPage,
  fonts: FontSet,
  text: string | null | undefined,
  x: number,
  y: number,
  size: number
) {
  if (!text) return
  drawText(page, fonts.bold, text, x, y, size)
}

function drawBoldTextFitted(
  page: PDFPage,
  fonts: FontSet,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  minSize = 5.2
) {
  if (!cleanText(text)) return
  drawTextFitted(page, fonts.bold, text, x, y, maxWidth, baseSize, minSize)
}

function splitSignerForPdf(signer: string): {
  name: string
  isBehalf: boolean
} {
  const cleaned = cleanText(signer)
  const isBehalf =
    /v\s+zastoupení/i.test(cleaned) || /\bv\.?\s*z\.?\b/i.test(cleaned)

  const name = cleaned
    .replace(/\s*[—-]\s*v\s+zastoupení\s*$/i, "")
    .replace(/\s*\(v\s+zastoupení\)\s*$/i, "")
    .replace(/^\s*v\.?\s*z\.?\s*/i, "")
    .trim()

  return { name: name || cleaned, isBehalf }
}

function drawSignatureBlockBase(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number,
  options: {
    nameSize: number
    dateSize: number
    noteSize: number
    lineHeight: number
  }
) {
  const rawName = cleanText(signer)
  if (!rawName) return

  const { name, isBehalf } = splitSignerForPdf(rawName)
  const displayName = isBehalf ? `v.z. ${name}` : name
  const nameLines = wrapText(
    displayName,
    fonts.regular,
    options.nameSize,
    maxWidth
  )

  let currentY = y

  for (const line of nameLines) {
    drawText(page, fonts.regular, line, x, currentY, options.nameSize)
    currentY -= options.lineHeight
  }

  if (signedAt) {
    drawText(
      page,
      fonts.regular,
      formatCzDateTime(signedAt),
      x,
      currentY,
      options.dateSize
    )
    currentY -= options.lineHeight - 1
  }

  const noteLines = wrapText(
    SIGNATURE_NOTE_TEXT,
    fonts.regular,
    options.noteSize,
    maxWidth
  )

  for (const line of noteLines) {
    drawText(page, fonts.regular, line, x, currentY, options.noteSize)
    currentY -= options.noteSize + 1
  }
}

function drawSignatureBlockHeader(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  drawSignatureBlockBase(page, fonts, signer, signedAt, x, y, maxWidth, {
    nameSize: SIGNATURE_NAME_SIZE,
    dateSize: SIGNATURE_DATE_SIZE,
    noteSize: SIGNATURE_NOTE_SIZE,
    lineHeight: SIGNATURE_LINE_HEIGHT,
  })
}

function drawSignatureBlockTableRow(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  drawSignatureBlockBase(page, fonts, signer, signedAt, x, y, maxWidth, {
    nameSize: TABLE_SIGNATURE_NAME_SIZE,
    dateSize: TABLE_SIGNATURE_DATE_SIZE,
    noteSize: TABLE_SIGNATURE_NOTE_SIZE,
    lineHeight: TABLE_SIGNATURE_LINE_HEIGHT,
  })
}

function drawSignatureBlockSection(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  drawSignatureBlockBase(page, fonts, signer, signedAt, x, y, maxWidth, {
    nameSize: SIGNATURE_NAME_SIZE,
    dateSize: SIGNATURE_DATE_SIZE,
    noteSize: SIGNATURE_NOTE_SIZE,
    lineHeight: SIGNATURE_LINE_HEIGHT,
  })
}

function drawHorizontalLine(
  page: PDFPage,
  x1: number,
  x2: number,
  yFromTop: number,
  thickness = 0.5
) {
  page.drawLine({
    start: { x: x1, y: cv(yFromTop) },
    end: { x: x2, y: cv(yFromTop) },
    thickness,
    color: rgb(0, 0, 0),
  })
}

function drawVerticalLine(
  page: PDFPage,
  x: number,
  yTopFromTop: number,
  yBottomFromTop: number,
  thickness = 0.5
) {
  page.drawLine({
    start: { x, y: cv(yTopFromTop) },
    end: { x, y: cv(yBottomFromTop) },
    thickness,
    color: rgb(0, 0, 0),
  })
}

type AssetRow = {
  id?: string | null
  subject?: string | null
  inventoryNumber?: string | null
  createdById?: string | null
}

function normalizeAssetsForPdf(
  assets: ExitChecklistData["assets"]
): AssetRow[] {
  const validAssets = assets.filter(
    (asset) => cleanText(asset.subject) || cleanText(asset.inventoryNumber)
  )

  if (validAssets.length === 0) {
    return [
      {
        id: "empty",
        subject: "žádný evidovaný majetek",
        inventoryNumber: "",
        createdById: null,
      },
    ]
  }

  return validAssets
}

function drawAssetsTableOnly({
  page,
  fonts,
  assets,
  startTopY,
}: {
  page: PDFPage
  fonts: FontSet
  assets: ExitChecklistData["assets"]
  startTopY: number
}): number {
  const rows = normalizeAssetsForPdf(assets)
  const leftX = ASSET_TABLE_LEFT
  const rightX = ASSET_TABLE_RIGHT
  const splitX = ASSET_TABLE_SPLIT
  const headerHeight = ASSET_TABLE_HEADER_HEIGHT
  const rowHeight = ASSET_TABLE_ROW_HEIGHT
  const tableBottomY = startTopY + headerHeight + rows.length * rowHeight

  drawHorizontalLine(page, leftX, rightX, startTopY, 0.55)
  drawHorizontalLine(page, leftX, rightX, startTopY + headerHeight, 0.55)
  drawHorizontalLine(page, leftX, rightX, tableBottomY, 0.55)
  drawVerticalLine(page, leftX, startTopY, tableBottomY, 0.55)
  drawVerticalLine(page, splitX, startTopY, tableBottomY, 0.55)
  drawVerticalLine(page, rightX, startTopY, tableBottomY, 0.55)

  if (DRAW_ASSET_TABLE_HEADER_TEXT) {
    drawBoldText(page, fonts, "Předmět", leftX + 7, cv(startTopY + 14), 10)

    drawBoldText(
      page,
      fonts,
      "Inventární číslo",
      splitX + 7,
      cv(startTopY + 14),
      10
    )
  }

  rows.forEach((row, index) => {
    const rowTopY = startTopY + headerHeight + index * rowHeight
    const rowBottomY = rowTopY + rowHeight

    if (index > 0) drawHorizontalLine(page, leftX, rightX, rowTopY, 0.45)

    drawTextFitted(
      page,
      fonts.regular,
      cleanText(row.subject),
      leftX + 7,
      cv(rowTopY + 14),
      splitX - leftX - 16,
      GENERATED_TEXT_SIZE,
      6.5
    )

    drawTextFitted(
      page,
      fonts.regular,
      cleanText(row.inventoryNumber),
      splitX + 7,
      cv(rowTopY + 14),
      rightX - splitX - 16,
      GENERATED_TEXT_SIZE,
      6.5
    )

    if (index === rows.length - 1) {
      drawHorizontalLine(page, leftX, rightX, rowBottomY, 0.55)
    }
  })

  return tableBottomY
}

type HandoverRecipientLike = {
  name?: string | null
  email?: string | null
  personalNumber?: string | null
  department?: string | null
}

function getHandoverRecipients(
  handover?: HandoverAgendaData
): HandoverRecipientLike[] {
  const withRecipients = handover as
    | (HandoverAgendaData & { handoverRecipients?: HandoverRecipientLike[] })
    | undefined

  return Array.isArray(withRecipients?.handoverRecipients)
    ? withRecipients.handoverRecipients
    : []
}

function formatHandoverRecipientForPdf(
  recipient: HandoverRecipientLike,
  index: number
): HandoverBlock {
  const name = cleanText(recipient.name)
  const email = cleanText(recipient.email)
  const personalNumber = cleanText(recipient.personalNumber)
  const department = cleanText(recipient.department)

  const details = [
    personalNumber ? `osobní číslo: ${personalNumber}` : "",
    department ? `odbor: ${department}` : "",
    email ? `e-mail: ${email}` : "",
  ].filter(Boolean)

  return {
    type: "recipient",
    index,
    name: name || email || "neuvedená osoba",
    details,
  }
}

type RichTextSegment = {
  text: string
  bold?: boolean
}

type HandoverBlock =
  | {
      type: "paragraph"
      segments: RichTextSegment[]
      indent?: number
      spacingAfter?: number
    }
  | {
      type: "recipient"
      index: number
      name: string
      details: string[]
    }

function cleanPositionName(value?: string | null, positionNum?: string | null) {
  const rawValue = cleanText(value)
  const rawPositionNum = cleanText(positionNum)

  if (!rawValue || !rawPositionNum) return rawValue

  const escapedPositionNum = rawPositionNum.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  )

  return rawValue
    .replace(new RegExp(`^${escapedPositionNum}\\s*[—–-]\\s*`), "")
    .replace(new RegExp(`^${escapedPositionNum}\\s+`), "")
    .trim()
}

function buildHandoverSummary(handover?: HandoverAgendaData): HandoverBlock[] {
  if (!handover?.includeHandoverAgenda) return []

  const blocks: HandoverBlock[] = []

  if (handover.option1) {
    blocks.push({
      type: "paragraph",
      segments: [
        {
          text: "Předáno zaměstnancem do spisovny v e-spise nebo předáno na jiné funkční místo.",
        },
      ],
      spacingAfter: 7,
    })
  }

  if (handover.option2) {
    const positionNumber = cleanText(handover.option2TargetPositionNum)
    const positionName = cleanPositionName(
      handover.option2Target,
      handover.option2TargetPositionNum
    )

    const targetPosition = [positionNumber, positionName]
      .filter(Boolean)
      .join(" — ")

    if (targetPosition) {
      blocks.push({
        type: "paragraph",
        segments: [
          { text: "OI-KITT6 předá dokumenty na jiné funkční místo: " },
          { text: targetPosition, bold: true },
          { text: "." },
        ],
        spacingAfter: 7,
      })
    } else {
      blocks.push({
        type: "paragraph",
        segments: [{ text: "OI-KITT6 předá dokumenty na jiné funkční místo." }],
        spacingAfter: 7,
      })
    }
  }

  if (handover.option3) {
    const reason = cleanText(handover.option3Reason)
    const recipients = getHandoverRecipients(handover)

    if (reason) {
      blocks.push({
        type: "paragraph",
        segments: [
          {
            text: "Agenda zatím zůstává na neobsazeném funkčním místě z důvodu: ",
          },
          { text: reason, bold: true },
          { text: "." },
        ],
        spacingAfter: recipients.length > 0 ? 10 : 7,
      })
    } else {
      blocks.push({
        type: "paragraph",
        segments: [
          {
            text: "Agenda zatím zůstává na neobsazeném funkčním místě.",
          },
        ],
        spacingAfter: recipients.length > 0 ? 10 : 7,
      })
    }

    if (recipients.length > 0) {
      blocks.push({
        type: "paragraph",
        segments: [{ text: "Za dokumenty odpovídá:", bold: true }],
        spacingAfter: 7,
      })

      recipients.forEach((recipient, index) => {
        blocks.push(formatHandoverRecipientForPdf(recipient, index + 1))
      })
    }
  }

  return blocks
}

function measureRichSegments(
  segments: RichTextSegment[],
  fonts: FontSet,
  fontSize: number
) {
  return segments.reduce((sum, segment) => {
    const font = segment.bold ? fonts.bold : fonts.regular
    return sum + font.widthOfTextAtSize(segment.text, fontSize)
  }, 0)
}

function splitRichSegmentWords(segment: RichTextSegment): RichTextSegment[] {
  const words = segment.text.split(" ")

  return words.flatMap((word, index) => {
    const suffix = index < words.length - 1 ? " " : ""
    const text = `${word}${suffix}`
    return text ? [{ text, bold: segment.bold }] : []
  })
}

function wrapRichText(
  segments: RichTextSegment[],
  fonts: FontSet,
  fontSize: number,
  maxWidth: number
): RichTextSegment[][] {
  const parts = segments.flatMap(splitRichSegmentWords)
  const lines: RichTextSegment[][] = []
  let current: RichTextSegment[] = []

  for (const part of parts) {
    const candidate = [...current, part]

    if (measureRichSegments(candidate, fonts, fontSize) <= maxWidth) {
      current = candidate
      continue
    }

    if (current.length > 0) {
      lines.push(current)
      current = [part]
    } else {
      lines.push([part])
      current = []
    }
  }

  if (current.length > 0) lines.push(current)

  return lines
}

function drawRichParagraph(
  page: PDFPage,
  fonts: FontSet,
  segments: RichTextSegment[],
  x: number,
  y: number,
  maxWidth: number,
  fontSize = GENERATED_TEXT_SIZE,
  lineHeight = GENERATED_LINE_HEIGHT
): number {
  const lines = wrapRichText(segments, fonts, fontSize, maxWidth)

  for (const line of lines) {
    let currentX = x

    for (const segment of line) {
      if (!segment.text) continue

      const font = segment.bold ? fonts.bold : fonts.regular
      drawText(page, font, segment.text, currentX, y, fontSize)
      currentX += font.widthOfTextAtSize(segment.text, fontSize)
    }

    y -= lineHeight
  }

  return y
}

function drawHandoverRecipientBlock(
  page: PDFPage,
  fonts: FontSet,
  block: Extract<HandoverBlock, { type: "recipient" }>,
  x: number,
  y: number,
  maxWidth: number
): number {
  const numberWidth = 22
  const contentX = x + numberWidth
  const detailsX = contentX + HANDOVER_RECIPIENT_DETAIL_INDENT
  const fontSize = GENERATED_TEXT_SIZE
  const lineHeight = GENERATED_LINE_HEIGHT

  drawText(page, fonts.regular, `${block.index}.`, x, y, fontSize)

  y = drawRichParagraph(
    page,
    fonts,
    [{ text: block.name, bold: true }],
    contentX,
    y,
    maxWidth - numberWidth,
    fontSize,
    lineHeight
  )

  if (block.details.length > 0) {
    y += 1

    for (const detail of block.details) {
      y = drawParagraph(
        page,
        fonts.regular,
        detail,
        detailsX,
        y,
        maxWidth - numberWidth - HANDOVER_RECIPIENT_DETAIL_INDENT,
        fontSize,
        lineHeight
      )
    }
  }

  return y - 6
}

function createBlankPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

function getOrCreatePage(pdf: PDFDocument, index: number) {
  const pages = pdf.getPages()

  if (pages[index]) return pages[index]

  while (pdf.getPages().length <= index) {
    createBlankPage(pdf)
  }

  return pdf.getPage(index)
}

function drawHandoverSection({
  pdf,
  page,
  fonts,
  handover,
  managerName,
  handoverManagerSignature,
  startY,
}: {
  pdf: PDFDocument
  page: PDFPage
  fonts: FontSet
  handover?: HandoverAgendaData
  managerName?: string | null
  handoverManagerSignature?: ExitChecklistSignatureValue | null
  startY: number
}) {
  let activePage = page
  let y = cv(startY)

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < 45) {
      activePage = createBlankPage(pdf)
      y = cv(60)
    }
  }

  ensureSpace(110)

  drawBoldText(activePage, fonts, "C.", SECTION_LEFT, y, HANDOVER_TITLE_SIZE)
  drawBoldText(
    activePage,
    fonts,
    "Předávaná agenda",
    SECTION_LEFT + 21,
    y,
    HANDOVER_TITLE_SIZE
  )

  y -= 19

  y = drawParagraph(
    activePage,
    fonts.regular,
    "Elektronické dokumenty v e-spisu – elektronické předání dokumentů proběhne/proběhlo následujícím způsobem:",
    SECTION_LEFT,
    y,
    SECTION_WIDTH - 8,
    HANDOVER_BODY_SIZE,
    HANDOVER_BODY_LINE_HEIGHT
  )

  y -= 7

  const handoverBlocks = buildHandoverSummary(handover)

  if (handoverBlocks.length > 0) {
    for (const block of handoverBlocks) {
      const neededSpace = block.type === "recipient" ? 62 : 34
      ensureSpace(neededSpace)

      if (block.type === "recipient") {
        y = drawHandoverRecipientBlock(
          activePage,
          fonts,
          block,
          SECTION_LEFT + 14,
          y,
          SECTION_WIDTH - 28
        )
        continue
      }

      y = drawRichParagraph(
        activePage,
        fonts,
        block.segments,
        SECTION_LEFT + (block.indent ?? 0),
        y,
        SECTION_WIDTH - 8 - (block.indent ?? 0),
        HANDOVER_BODY_SIZE,
        HANDOVER_BODY_LINE_HEIGHT
      )

      y -= block.spacingAfter ?? 6
    }

    y -= 8
  } else {
    drawText(
      activePage,
      fonts.regular,
      "Není evidována žádná agenda k předání.",
      SECTION_LEFT,
      y,
      HANDOVER_BODY_SIZE
    )
    y -= 18
  }

  if (y - 82 < 45) {
    activePage = createBlankPage(pdf)
    y = cv(60)
  }

  y -= 10

  const labelX = SECTION_LEFT
  const roleX = 250
  const signatureX = 394

  drawText(
    activePage,
    fonts.regular,
    "Způsob předání agendy potvrzuje:",
    labelX,
    y,
    GENERATED_TEXT_SIZE
  )

  drawText(
    activePage,
    fonts.regular,
    "Vedoucí odboru",
    roleX,
    y,
    GENERATED_TEXT_SIZE
  )

  if (managerName) {
    drawTextFitted(
      activePage,
      fonts.regular,
      cleanText(managerName),
      roleX,
      y - 16,
      145,
      GENERATED_TEXT_SIZE,
      7
    )
  }

  if (handoverManagerSignature?.signedByName) {
    drawSignatureBlockSection(
      activePage,
      fonts,
      handoverManagerSignature.signedByName,
      handoverManagerSignature.signedAt,
      signatureX,
      y,
      130
    )
  }
}

type TableRowPosition = {
  page: 1 | 2
  top: number
  bottom: number
}

const rowPositionMap: Record<string, TableRowPosition> = {
  handoverProtocol: { page: 1, top: 389.3, bottom: 446.0 },
  sneoChip: { page: 1, top: 446.0, bottom: 502.7 },
  sneoRemote: { page: 1, top: 502.7, bottom: 559.4 },
  electronicTicket: { page: 1, top: 559.4, bottom: 616.1 },
  carChip: { page: 1, top: 616.1, bottom: 672.8 },
  cashAdvance: { page: 1, top: 672.8, bottom: 729.5 },

  serviceTools: { page: 2, top: 74.3, bottom: 131.0 },
  serviceId: { page: 2, top: 131.0, bottom: 187.7 },
  centralRegistry: { page: 2, top: 187.7, bottom: 244.4 },
  classifiedDocs: { page: 2, top: 244.4, bottom: 301.1 },
  fineBlocks: { page: 2, top: 301.1, bottom: 357.8 },
  socialFundLoan: { page: 2, top: 357.8, bottom: 414.5 },
  phoneCosts: { page: 2, top: 414.5, bottom: 471.2 },
  itEquipment: { page: 2, top: 471.2, bottom: 527.9 },
  espis: { page: 2, top: 527.9, bottom: 584.6 },
  lawInfo: { page: 2, top: 584.6, bottom: 641.3 },
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    const user = session?.user

    if (!user) {
      return new Response(JSON.stringify({ error: "Nejste přihlášen(a)." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const role = user.role ?? "USER"

    if (!canAccessInternalApp(role) || !canReadExitChecklist(role)) {
      return new Response(
        JSON.stringify({
          error: "Nemáte oprávnění zobrazit PDF výstupního listu.",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const id = Number(params.id)
    if (Number.isNaN(id)) throw new Error("Neplatné ID odchodu.")

    const cookie = req.headers.get("cookie") ?? null

    const tplPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "docs",
      "vystupni-list.pdf"
    )

    const [tplBytes, regularFontBytes, boldFontBytes, checklist] =
      await Promise.all([
        fs.readFile(tplPath),
        readRequiredFont(ARIAL_REGULAR_FONT_CANDIDATES, "Arial"),
        readRequiredFont(ARIAL_BOLD_FONT_CANDIDATES, "Arial Bold"),
        getChecklistById(id, cookie),
      ])

    const pdf = await PDFDocument.load(tplBytes)
    pdf.registerFontkit(fontkit)

    const regularFont = await pdf.embedFont(regularFontBytes, { subset: false })
    const boldFont = await pdf.embedFont(boldFontBytes, { subset: false })

    const fonts: FontSet = { regular: regularFont, bold: boldFont }

    const page1 = getOrCreatePage(pdf, 0)
    const page2 = getOrCreatePage(pdf, 1)
    const page3 = getOrCreatePage(pdf, 2)

    const {
      employeeName,
      personalNumber,
      department,
      unitName,
      employmentEndDate,
      items,
      assets,
      handover,
      signatures,
      conflictOfInterest,
      managerName,
      handoverManagerSignature,
    } = checklist

    drawBoldTextFitted(
      page1,
      fonts,
      cleanText(employeeName),
      HEADER_VALUE_X,
      cv(158.2),
      HEADER_VALUE_MAX_WIDTH,
      GENERATED_TEXT_SIZE
    )

    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(personalNumber),
      HEADER_VALUE_X,
      cv(179.8),
      HEADER_VALUE_MAX_WIDTH,
      GENERATED_TEXT_SIZE
    )

    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(department),
      HEADER_VALUE_X,
      cv(201.4),
      HEADER_VALUE_MAX_WIDTH,
      GENERATED_TEXT_SIZE
    )

    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(unitName),
      HEADER_VALUE_X,
      cv(223.0),
      HEADER_VALUE_MAX_WIDTH,
      GENERATED_TEXT_SIZE
    )

    drawText(
      page1,
      fonts.regular,
      formatCzDate(employmentEndDate),
      HEADER_VALUE_X,
      cv(244.2),
      GENERATED_TEXT_SIZE
    )

    if (signatures?.employee?.signedByName) {
      drawSignatureBlockHeader(
        page1,
        fonts,
        signatures.employee.signedByName,
        signatures.employee.signedAt,
        52,
        cv(278),
        205
      )
    }

    if (signatures?.manager?.signedByName) {
      drawSignatureBlockHeader(
        page1,
        fonts,
        signatures.manager.signedByName,
        signatures.manager.signedAt,
        292,
        cv(278),
        205
      )
    }

    if (managerName) {
      drawTextFitted(
        page1,
        fonts.regular,
        cleanText(managerName),
        50.5,
        cv(420),
        160,
        GENERATED_TEXT_SIZE,
        6
      )
    }

    for (const item of items) {
      const rowInfo = rowPositionMap[item.key]
      if (!rowInfo) continue

      const page = rowInfo.page === 1 ? page1 : page2
      const rowCenterFromTop = (rowInfo.top + rowInfo.bottom) / 2
      const resolutionY = cv(rowCenterFromTop + 4)
      const signatureY = cv(rowInfo.top + 18)

      if (item.key === "lawInfo" && !conflictOfInterest) {
        drawCenteredText(
          page,
          fonts.regular,
          "-----------",
          TABLE_RESOLUTION_CENTER_X,
          resolutionY,
          GENERATED_TEXT_SIZE
        )
        drawText(
          page,
          fonts.regular,
          "Nepodává se",
          TABLE_SIGNATURE_X,
          resolutionY,
          GENERATED_TEXT_SIZE
        )
        continue
      }

      if (item.resolved === "YES") {
        drawCenteredText(
          page,
          fonts.regular,
          "Ano",
          TABLE_RESOLUTION_CENTER_X,
          resolutionY,
          GENERATED_TEXT_SIZE
        )
      } else if (item.resolved === "NO") {
        drawCenteredText(
          page,
          fonts.regular,
          "Ne",
          TABLE_RESOLUTION_CENTER_X,
          resolutionY,
          GENERATED_TEXT_SIZE
        )
      }

      if (item.signedAt && item.signedByName) {
        drawSignatureBlockTableRow(
          page,
          fonts,
          item.signedByName,
          item.signedAt,
          TABLE_SIGNATURE_X,
          signatureY,
          TABLE_SIGNATURE_MAX_WIDTH
        )
      }
    }

    const bTableStartTopY = 128
    const assetsTableBottomY = drawAssetsTableOnly({
      page: page3,
      fonts,
      assets,
      startTopY: bTableStartTopY,
    })

    const issuerTopY = assetsTableBottomY + 26

    drawText(
      page3,
      fonts.regular,
      "Za Odbor služeb potvrzuje správnost Výpisu:",
      SECTION_LEFT,
      cv(issuerTopY),
      GENERATED_TEXT_SIZE
    )

    if (signatures?.issuer?.signedByName) {
      drawSignatureBlockSection(
        page3,
        fonts,
        signatures.issuer.signedByName,
        signatures.issuer.signedAt,
        278,
        cv(issuerTopY),
        165
      )
    }

    const handoverStartY = issuerTopY + 52

    if (handoverStartY > 750) {
      const extraPage = createBlankPage(pdf)
      drawHandoverSection({
        pdf,
        page: extraPage,
        fonts,
        handover,
        managerName,
        handoverManagerSignature,
        startY: 60,
      })
    } else {
      drawHandoverSection({
        pdf,
        page: page3,
        fonts,
        handover,
        managerName,
        handoverManagerSignature,
        startY: handoverStartY,
      })
    }

    const pdfBytes = await pdf.save()

    const isInternalFetch = req.headers.get("x-internal-fetch") === "1"

    if (!isInternalFetch) {
      const existingChecklist = await prisma.exitChecklist.findUnique({
        where: { offboardingId: id },
        select: { id: true },
      })

      if (existingChecklist) {
        await logExitChecklistEvent({
          checklistId: existingChecklist.id,
          action: "PDF_DOWNLOADED",
          by: (user as { id?: string }).id ?? null,
          byName: user.name ?? user.email ?? null,
          byEmail: user.email ?? null,
          message: "PDF výstupního listu bylo staženo.",
        })
      }
    }

    return new Response(toArrayBuffer(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Vystupni-list-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[vystupni-list] ERROR:", message)

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
