import fs from "fs/promises"
import path from "path"

import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import type {
  ExitChecklistData,
  ExitChecklistItem,
  ExitChecklistSignatureValue,
  HandoverAgendaData,
} from "@/types/exit-checklist"
import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

import { prisma } from "@/lib/db"
import {
  getOrCreateChecklist,
  isPraha6OrKitt6,
  mapToExitChecklistData,
  sanitizeExitChecklistFilename,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { isActiveSignatureRecipient } from "@/lib/exit-checklist-recipient-key"
import { resolveRowSignatoryOverrideName } from "@/lib/exit-checklist-row-signatory"
import {
  canAccessInternalApp,
  canAdminExitChecklist,
  canReadExitChecklist,
} from "@/lib/rbac"

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_HEIGHT = 841.92
const PAGE_WIDTH = 595.28

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value?: string | null) => (value ?? "").normalize("NFC")

const SECTION_LEFT = 47
const SECTION_RIGHT = 543
const SECTION_WIDTH = SECTION_RIGHT - SECTION_LEFT

const ASSET_TABLE_LEFT = 47
const ASSET_TABLE_RIGHT = 543
const ASSET_TABLE_SPLIT = 322
const ASSET_TABLE_HEADER_HEIGHT = 18
const ASSET_TABLE_ROW_HEIGHT = 18
const DRAW_ASSET_TABLE_HEADER_TEXT = true

const HEADER_VALUE_X = 292
const HEADER_VALUE_MAX_WIDTH = 244

const GENERATED_TEXT_SIZE = 10
const GENERATED_LINE_HEIGHT = 12.2

const SIGNATURE_NAME_SIZE = 10
const SIGNATURE_DATE_SIZE = 8.2
const SIGNATURE_NOTE_SIZE = 5.2
const SIGNATURE_LINE_HEIGHT = 10.2

const TABLE_SIGNATURE_NAME_SIZE = 8.5
const TABLE_SIGNATURE_DATE_SIZE = 7.5
const TABLE_SIGNATURE_NOTE_SIZE = 4.7
const TABLE_SIGNATURE_LINE_HEIGHT = 7.6

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

async function getChecklistById(id: number): Promise<ExitChecklistData> {
  const result = await getOrCreateChecklist(id)
  if (!result) throw new Error("Odchod nenalezen.")

  return mapToExitChecklistData(result.off, result.checklist)
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
  return (value ?? "").replace(/[^\S ]+/g, " ").trim()
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

function drawCenteredTextFitted(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  minSize = 5.5
) {
  const normalized = nfc(text)
  let size = baseSize
  let width = font.widthOfTextAtSize(normalized, size)

  if (width > maxWidth) {
    size = Math.max(minSize, (maxWidth / width) * size)
    width = font.widthOfTextAtSize(normalized, size)
  }

  page.drawText(normalized, {
    x: centerX - width / 2,
    y,
    size,
    font,
  })
}

function splitOversizedWord(
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const chunks: string[] = []
  let current = ""

  for (const char of word) {
    const candidate = current + char

    if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      chunks.push(current)
      current = char
      continue
    }

    current = candidate
  }

  if (current) chunks.push(current)

  return chunks
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
      current = ""
    }

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      current = word
      continue
    }

    const chunks = splitOversizedWord(word, font, fontSize, maxWidth)
    for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i])
    current = chunks[chunks.length - 1] ?? ""
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

const OBLIG_TITLE_SIZE = HANDOVER_TITLE_SIZE

const OBLIG_COL_ORG_WIDTH = 132
const OBLIG_COL_OBLIGATION_WIDTH = 105
const OBLIG_COL_RESOLVED_WIDTH = 42
const OBLIG_COL_NOTE_WIDTH = 85
const OBLIG_SUB_ROW_GAP = 6
const OBLIG_COL_SIGNATURE_WIDTH =
  SECTION_WIDTH -
  OBLIG_COL_ORG_WIDTH -
  OBLIG_COL_OBLIGATION_WIDTH -
  OBLIG_COL_RESOLVED_WIDTH -
  OBLIG_COL_NOTE_WIDTH

const OBLIG_COL_ORG_X = SECTION_LEFT
const OBLIG_COL_OBLIGATION_X = OBLIG_COL_ORG_X + OBLIG_COL_ORG_WIDTH
const OBLIG_COL_RESOLVED_X = OBLIG_COL_OBLIGATION_X + OBLIG_COL_OBLIGATION_WIDTH
const OBLIG_COL_NOTE_X = OBLIG_COL_RESOLVED_X + OBLIG_COL_RESOLVED_WIDTH
const OBLIG_COL_SIGNATURE_X = OBLIG_COL_NOTE_X + OBLIG_COL_NOTE_WIDTH

const OBLIG_CELL_PAD_X = 6
const OBLIG_CELL_PAD_TOP = 8
const OBLIG_ROW_PAD_BOTTOM = 6
const OBLIG_ROW_MIN_BODY_HEIGHT = 24
const OBLIG_SUBROW_CONTENT_PAD_Y = 4
const OBLIG_HEADER_HEIGHT = 18
const OBLIG_HEADER_LABEL_SIZE = 8.5
const OBLIG_TEXT_SIZE = 9
const OBLIG_LINE_HEIGHT = 10.8
const OBLIG_SUB_TEXT_SIZE = 8
const OBLIG_SUB_LINE_HEIGHT = 9.6
const OBLIG_NOTE_TEXT_SIZE = 8
const OBLIG_NOTE_LINE_HEIGHT = 9.6
const OBLIG_TABLE_BOTTOM_MARGIN = 775
const OBLIG_NEW_PAGE_TOP_Y = 60
const SECTION_GAP_AFTER_TABLE = 26
const SECTION_B_MIN_SPACE = 90

type OrgLine = { text: string; bold: boolean; emphasizedSize: boolean }

function measureSignatureBlockHeight(
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  maxWidth: number,
  sizes: {
    nameSize: number
    dateSize: number
    noteSize: number
    lineHeight: number
  }
): number {
  const rawName = cleanText(signer)
  if (!rawName) return 0

  const { name, isBehalf } = splitSignerForPdf(rawName)
  const displayName = isBehalf ? `v.z. ${name}` : name
  const nameLines = wrapText(
    displayName,
    fonts.regular,
    sizes.nameSize,
    maxWidth
  )

  let height = nameLines.length * sizes.lineHeight

  if (signedAt) height += sizes.lineHeight - 1

  const noteLines = wrapText(
    SIGNATURE_NOTE_TEXT,
    fonts.regular,
    sizes.noteSize,
    maxWidth
  )
  height += noteLines.length * (sizes.noteSize + 1)

  return height
}

const ORG_DEPARTMENT_LINE_KEYWORD =
  /(Odbor|Oddělení|Kancelář|Správa|KITT6|Vedoucí|Ředitel|Právní odbor)/i
const ORG_LINE_HAS_DIGIT = /\d/

type OrgLineKind = "department" | "name" | "detail"

function classifyOrgLine(line: string): OrgLineKind {
  if (ORG_LINE_HAS_DIGIT.test(line)) return "detail"
  if (ORG_DEPARTMENT_LINE_KEYWORD.test(line)) return "department"
  return "name"
}

function buildOrganizationLines(
  organization: string,
  managerName: string | null | undefined,
  nameOverride: string | null | undefined,
  fonts: FontSet,
  maxWidth: number
): OrgLine[] {
  const rawLines = organization.split("\n").filter(Boolean)
  if (rawLines.length === 0) return []

  const lines: OrgLine[] = []

  for (const wrapped of wrapText(
    rawLines[0],
    fonts.regular,
    OBLIG_TEXT_SIZE,
    maxWidth
  )) {
    lines.push({ text: wrapped, bold: false, emphasizedSize: true })
  }

  const cleanedManagerName = cleanText(managerName)

  if (rawLines[0] === "Vedoucí odboru" && cleanedManagerName) {
    for (const wrapped of wrapText(
      cleanedManagerName,
      fonts.bold,
      OBLIG_TEXT_SIZE,
      maxWidth
    )) {
      lines.push({ text: wrapped, bold: true, emphasizedSize: true })
    }
  }

  const cleanedNameOverride = cleanText(nameOverride)
  let usedOverride = false

  for (const raw of rawLines.slice(1)) {
    const kind = classifyOrgLine(raw)
    const isName = kind === "name"
    const emphasizedSize = kind === "department" || kind === "name"
    const useOverrideHere =
      isName && !usedOverride && Boolean(cleanedNameOverride)
    const displayText = useOverrideHere ? cleanedNameOverride : raw
    if (useOverrideHere) usedOverride = true

    for (const wrapped of wrapText(
      displayText,
      isName ? fonts.bold : fonts.regular,
      emphasizedSize ? OBLIG_TEXT_SIZE : OBLIG_SUB_TEXT_SIZE,
      maxWidth
    )) {
      lines.push({ text: wrapped, bold: isName, emphasizedSize })
    }
  }

  return lines
}

function drawObligationsTableHeader(
  page: PDFPage,
  fonts: FontSet,
  topY: number
) {
  const labelY = cv(topY + 13)

  drawBoldText(
    page,
    fonts,
    "Odbor / organizace",
    OBLIG_COL_ORG_X + OBLIG_CELL_PAD_X,
    labelY,
    OBLIG_HEADER_LABEL_SIZE
  )
  drawBoldText(
    page,
    fonts,
    "Závazek",
    OBLIG_COL_OBLIGATION_X + OBLIG_CELL_PAD_X,
    labelY,
    OBLIG_HEADER_LABEL_SIZE
  )
  drawCenteredTextFitted(
    page,
    fonts.bold,
    "Vyrovnán",
    OBLIG_COL_RESOLVED_X + OBLIG_COL_RESOLVED_WIDTH / 2,
    labelY,
    OBLIG_COL_RESOLVED_WIDTH - 4,
    OBLIG_HEADER_LABEL_SIZE
  )
  drawBoldText(
    page,
    fonts,
    "Poznámka",
    OBLIG_COL_NOTE_X + OBLIG_CELL_PAD_X,
    labelY,
    OBLIG_HEADER_LABEL_SIZE
  )
  drawBoldText(
    page,
    fonts,
    "Datum a podpis",
    OBLIG_COL_SIGNATURE_X + OBLIG_CELL_PAD_X,
    labelY,
    OBLIG_HEADER_LABEL_SIZE
  )

  drawHorizontalLine(
    page,
    SECTION_LEFT,
    SECTION_RIGHT,
    topY + OBLIG_HEADER_HEIGHT,
    0.5
  )
}

function groupObligationItems(
  items: ExitChecklistItem[]
): ExitChecklistItem[][] {
  const rowKeyToGroupId = new Map<string, string>()

  for (const signatory of EXIT_CHECKLIST_SIGNATORIES) {
    const groupId = signatory.rowKeys.join("+")
    for (const key of signatory.rowKeys) rowKeyToGroupId.set(key, groupId)
  }

  for (const key of LAW_SIGNATORY.rowKeys) {
    rowKeyToGroupId.set(key, LAW_SIGNATORY.rowKeys.join("+"))
  }

  const groups: ExitChecklistItem[][] = []
  const groupIndexById = new Map<string, number>()

  for (const item of items) {
    const groupId = rowKeyToGroupId.get(item.key) ?? item.key
    let index = groupIndexById.get(groupId)

    if (index === undefined) {
      index = groups.length
      groupIndexById.set(groupId, index)
      groups.push([])
    }

    groups[index].push(item)
  }

  return groups
}

function drawObligationsTableBorders(
  page: PDFPage,
  segmentTopY: number,
  segmentBottomY: number,
  innerLineYs: number[]
) {
  drawHorizontalLine(page, SECTION_LEFT, SECTION_RIGHT, segmentTopY, 0.6)

  for (const lineY of innerLineYs) {
    drawHorizontalLine(page, SECTION_LEFT, SECTION_RIGHT, lineY, 0.4)
  }

  drawHorizontalLine(page, SECTION_LEFT, SECTION_RIGHT, segmentBottomY, 0.6)
  drawVerticalLine(page, SECTION_LEFT, segmentTopY, segmentBottomY, 0.6)
  drawVerticalLine(
    page,
    OBLIG_COL_OBLIGATION_X,
    segmentTopY,
    segmentBottomY,
    0.4
  )
  drawVerticalLine(page, OBLIG_COL_RESOLVED_X, segmentTopY, segmentBottomY, 0.4)
  drawVerticalLine(page, OBLIG_COL_NOTE_X, segmentTopY, segmentBottomY, 0.4)
  drawVerticalLine(
    page,
    OBLIG_COL_SIGNATURE_X,
    segmentTopY,
    segmentBottomY,
    0.4
  )
  drawVerticalLine(page, SECTION_RIGHT, segmentTopY, segmentBottomY, 0.6)
}

function drawObligationsTable({
  pdf,
  fonts,
  items,
  conflictOfInterest,
  managerName,
  signatureRecipients,
  startPageIndex,
  startTopY,
}: {
  pdf: PDFDocument
  fonts: FontSet
  items: ExitChecklistItem[]
  conflictOfInterest: boolean | null | undefined
  managerName?: string | null
  signatureRecipients?: ExitChecklistData["signatureRecipients"]
  startPageIndex: number
  startTopY: number
}): { lastPageIndex: number; lastBottomY: number } {
  const visibleItems = items.filter(
    (item) => item.key !== "lawInfo" || conflictOfInterest === true
  )

  let pageIndex = startPageIndex
  let page = getOrCreatePage(pdf, pageIndex)

  drawBoldText(page, fonts, "A.", SECTION_LEFT, cv(startTopY), OBLIG_TITLE_SIZE)
  drawBoldText(
    page,
    fonts,
    "Vyrovnání závazků zaměstnance k zaměstnavateli",
    SECTION_LEFT + 20,
    cv(startTopY),
    OBLIG_TITLE_SIZE
  )

  let headerTopY = startTopY + 19
  drawObligationsTableHeader(page, fonts, headerTopY)

  let cursorTopY = headerTopY + OBLIG_HEADER_HEIGHT
  let segmentTopY = headerTopY
  let innerLineYs: number[] = []

  for (const group of groupObligationItems(visibleItems)) {
    const firstItem = group[0]

    const groupRowKeys = group.map((item) => item.key)
    const nameOverride =
      firstItem.key === "handoverProtocol"
        ? null
        : resolveRowSignatoryOverrideName(groupRowKeys, signatureRecipients)

    const orgLines = buildOrganizationLines(
      firstItem.organization,
      firstItem.key === "handoverProtocol" ? managerName : null,
      nameOverride,
      fonts,
      OBLIG_COL_ORG_WIDTH - OBLIG_CELL_PAD_X * 2
    )

    const subRows = group.map((item) => {
      const obligationLines = wrapText(
        item.obligation,
        fonts.regular,
        OBLIG_TEXT_SIZE,
        OBLIG_COL_OBLIGATION_WIDTH - OBLIG_CELL_PAD_X * 2
      )

      const resolvedLabel =
        item.resolved === "YES" ? "Ano" : item.resolved === "NO" ? "Ne" : null

      const noteLines = wrapText(
        cleanText(item.note),
        fonts.regular,
        OBLIG_NOTE_TEXT_SIZE,
        OBLIG_COL_NOTE_WIDTH - OBLIG_CELL_PAD_X * 2
      )

      const signatureHeight = measureSignatureBlockHeight(
        fonts,
        item.signedByName,
        item.signedAt,
        OBLIG_COL_SIGNATURE_WIDTH - OBLIG_CELL_PAD_X * 2,
        {
          nameSize: TABLE_SIGNATURE_NAME_SIZE,
          dateSize: TABLE_SIGNATURE_DATE_SIZE,
          noteSize: TABLE_SIGNATURE_NOTE_SIZE,
          lineHeight: TABLE_SIGNATURE_LINE_HEIGHT,
        }
      )

      const contentHeight = Math.max(
        obligationLines.length * OBLIG_LINE_HEIGHT,
        noteLines.length * OBLIG_NOTE_LINE_HEIGHT,
        signatureHeight
      )

      const height = Math.max(
        contentHeight + OBLIG_SUBROW_CONTENT_PAD_Y * 2,
        OBLIG_ROW_MIN_BODY_HEIGHT
      )

      return {
        item,
        obligationLines,
        resolvedLabel,
        noteLines,
        signatureHeight,
        height,
      }
    })

    const subRowsTotalHeight =
      subRows.reduce((sum, row) => sum + row.height, 0) +
      OBLIG_SUB_ROW_GAP * (subRows.length - 1)

    const orgHeight = orgLines.reduce(
      (sum, line) =>
        sum + (line.emphasizedSize ? OBLIG_LINE_HEIGHT : OBLIG_SUB_LINE_HEIGHT),
      0
    )

    const bodyHeight = Math.max(orgHeight, subRowsTotalHeight)
    const rowHeight = OBLIG_CELL_PAD_TOP + bodyHeight + OBLIG_ROW_PAD_BOTTOM

    if (cursorTopY + rowHeight > OBLIG_TABLE_BOTTOM_MARGIN) {
      innerLineYs.pop()
      drawObligationsTableBorders(page, segmentTopY, cursorTopY, innerLineYs)

      pageIndex += 1
      page = getOrCreatePage(pdf, pageIndex)
      headerTopY = OBLIG_NEW_PAGE_TOP_Y
      drawObligationsTableHeader(page, fonts, headerTopY)
      cursorTopY = headerTopY + OBLIG_HEADER_HEIGHT
      segmentTopY = headerTopY
      innerLineYs = []
    }

    const rowTopY = cursorTopY

    const orgTopOffset = Math.max(0, (bodyHeight - orgHeight) / 2)
    let orgY = cv(
      rowTopY + OBLIG_CELL_PAD_TOP + orgTopOffset + OBLIG_TEXT_SIZE * 0.8
    )

    for (const line of orgLines) {
      drawText(
        page,
        line.bold ? fonts.bold : fonts.regular,
        line.text,
        OBLIG_COL_ORG_X + OBLIG_CELL_PAD_X,
        orgY,
        line.emphasizedSize ? OBLIG_TEXT_SIZE : OBLIG_SUB_TEXT_SIZE
      )
      orgY -= line.emphasizedSize ? OBLIG_LINE_HEIGHT : OBLIG_SUB_LINE_HEIGHT
    }

    let subRowTopY = rowTopY + OBLIG_CELL_PAD_TOP

    subRows.forEach((subRow, subRowIndex) => {
      const obligationContentHeight =
        subRow.obligationLines.length * OBLIG_LINE_HEIGHT
      const obligationTopOffset = Math.max(
        0,
        (subRow.height - obligationContentHeight) / 2
      )
      let obligationY = cv(
        subRowTopY + obligationTopOffset + OBLIG_TEXT_SIZE * 0.8
      )

      for (const line of subRow.obligationLines) {
        drawText(
          page,
          fonts.regular,
          line,
          OBLIG_COL_OBLIGATION_X + OBLIG_CELL_PAD_X,
          obligationY,
          OBLIG_TEXT_SIZE
        )
        obligationY -= OBLIG_LINE_HEIGHT
      }

      if (subRow.resolvedLabel) {
        const subRowCenterY = subRowTopY + subRow.height / 2

        drawCenteredTextFitted(
          page,
          fonts.regular,
          subRow.resolvedLabel,
          OBLIG_COL_RESOLVED_X + OBLIG_COL_RESOLVED_WIDTH / 2,
          cv(subRowCenterY + OBLIG_TEXT_SIZE * 0.32),
          OBLIG_COL_RESOLVED_WIDTH - 4,
          OBLIG_TEXT_SIZE
        )
      }

      const noteContentHeight = subRow.noteLines.length * OBLIG_NOTE_LINE_HEIGHT
      const noteTopOffset = Math.max(0, (subRow.height - noteContentHeight) / 2)
      let noteY = cv(subRowTopY + noteTopOffset + OBLIG_TEXT_SIZE * 0.8)

      for (const line of subRow.noteLines) {
        drawText(
          page,
          fonts.regular,
          line,
          OBLIG_COL_NOTE_X + OBLIG_CELL_PAD_X,
          noteY,
          OBLIG_NOTE_TEXT_SIZE
        )
        noteY -= OBLIG_NOTE_LINE_HEIGHT
      }

      if (subRow.item.signedAt && subRow.item.signedByName) {
        const signatureTopOffset = Math.max(
          0,
          (subRow.height - subRow.signatureHeight) / 2
        )
        const signatureY = cv(
          subRowTopY + signatureTopOffset + OBLIG_TEXT_SIZE * 0.8
        )

        drawSignatureBlockTableRow(
          page,
          fonts,
          subRow.item.signedByName,
          subRow.item.signedAt,
          OBLIG_COL_SIGNATURE_X + OBLIG_CELL_PAD_X,
          signatureY,
          OBLIG_COL_SIGNATURE_WIDTH - OBLIG_CELL_PAD_X * 2
        )
      }

      subRowTopY += subRow.height + OBLIG_SUB_ROW_GAP

      if (subRowIndex < subRows.length - 1) {
        drawHorizontalLine(
          page,
          OBLIG_COL_OBLIGATION_X,
          SECTION_RIGHT,
          subRowTopY - OBLIG_SUB_ROW_GAP / 2,
          0.3
        )
      }
    })

    cursorTopY += rowHeight
    innerLineYs.push(cursorTopY)
  }

  innerLineYs.pop()
  drawObligationsTableBorders(page, segmentTopY, cursorTopY, innerLineYs)

  return { lastPageIndex: pageIndex, lastBottomY: cursorTopY }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth()
    const user = session?.user

    if (!user) {
      return new Response(JSON.stringify({ error: "Nejste přihlášeni." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const role = user.role ?? "USER"
    const id = Number(params.id)
    if (Number.isNaN(id)) throw new Error("Neplatné ID odchodu.")

    const isInternalReader =
      canAccessInternalApp(role) && canReadExitChecklist(role)

    const checklist = await getChecklistById(id)

    if (!isInternalReader) {
      if (!user.email || !isPraha6OrKitt6(user.email)) {
        return new Response(
          JSON.stringify({
            error: "Nemáte oprávnění zobrazit PDF výstupního listu.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!canReadExitChecklist(role)) {
        return new Response(
          JSON.stringify({
            error: "Nemáte oprávnění zobrazit PDF výstupního listu.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      if (checklist.lockedAt) {
        return new Response(
          JSON.stringify({
            error:
              "Výstupní list je uzamčený – PDF si stáhněte přes interní aplikaci.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      }

      if (!canAdminExitChecklist(role)) {
        const currentUserEmail = normalizeEmail(user.email)
        const matches = (checklist.signatureRecipients ?? []).filter(
          (recipient) => normalizeEmail(recipient.email) === currentUserEmail
        )

        if (!isActiveSignatureRecipient(currentUserEmail, matches)) {
          const wasRemoved = matches.some((recipient) => recipient.revokedAt)
          return new Response(
            JSON.stringify({
              error: wasRemoved
                ? "Byli jste odebráni ze seznamu osob k podpisu – nemáte už přístup k tomuto výstupnímu listu."
                : "Nemáte přístup k PDF tohoto výstupního listu – nebyla vám zaslána pozvánka k podpisu.",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        }
      }
    }

    const tplPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "docs",
      "vystupni-list.pdf"
    )

    const [tplBytes, regularFontBytes, boldFontBytes] = await Promise.all([
      fs.readFile(tplPath),
      readRequiredFont(ARIAL_REGULAR_FONT_CANDIDATES, "Arial"),
      readRequiredFont(ARIAL_BOLD_FONT_CANDIDATES, "Arial Bold"),
    ])

    const pdf = await PDFDocument.load(tplBytes)
    pdf.registerFontkit(fontkit)

    const regularFont = await pdf.embedFont(regularFontBytes, { subset: false })
    const boldFont = await pdf.embedFont(boldFontBytes, { subset: false })

    const fonts: FontSet = { regular: regularFont, bold: boldFont }

    const page1 = getOrCreatePage(pdf, 0)

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
      signatureRecipients,
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

    const obligationsResult = drawObligationsTable({
      pdf,
      fonts,
      items,
      conflictOfInterest,
      managerName,
      signatureRecipients,
      startPageIndex: 0,
      startTopY: 350,
    })

    const bStartY = obligationsResult.lastBottomY + SECTION_GAP_AFTER_TABLE
    const bFitsOnSamePage =
      bStartY + SECTION_B_MIN_SPACE <= OBLIG_TABLE_BOTTOM_MARGIN

    const bPageIndex = bFitsOnSamePage
      ? obligationsResult.lastPageIndex
      : obligationsResult.lastPageIndex + 1
    const bPage = getOrCreatePage(pdf, bPageIndex)

    const bTitleTopY = bFitsOnSamePage ? bStartY : OBLIG_NEW_PAGE_TOP_Y

    drawBoldText(
      bPage,
      fonts,
      "B.",
      SECTION_LEFT,
      cv(bTitleTopY),
      OBLIG_TITLE_SIZE
    )
    drawBoldText(
      bPage,
      fonts,
      "Výpis z osobní karty zaměstnance o zapůjčení movitého majetku",
      SECTION_LEFT + 20,
      cv(bTitleTopY),
      OBLIG_TITLE_SIZE
    )

    const bTableStartTopY = bTitleTopY + 28
    const assetsTableBottomY = drawAssetsTableOnly({
      page: bPage,
      fonts,
      assets,
      startTopY: bTableStartTopY,
    })

    const issuerTopY = assetsTableBottomY + 20

    drawText(
      bPage,
      fonts.regular,
      "Za Odbor služeb potvrzuje správnost Výpisu:",
      SECTION_LEFT,
      cv(issuerTopY),
      GENERATED_TEXT_SIZE
    )

    if (signatures?.issuer?.signedByName) {
      drawSignatureBlockSection(
        bPage,
        fonts,
        signatures.issuer.signedByName,
        signatures.issuer.signedAt,
        278,
        cv(issuerTopY),
        165
      )
    }

    const handoverStartY = issuerTopY + 40

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
        page: bPage,
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

    const pdfFilename = `Vystupni-list-${sanitizeExitChecklistFilename(
      employeeName || String(id)
    )}.pdf`

    return new Response(toArrayBuffer(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdfFilename}"`,
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
