import fs from "fs/promises"
import path from "path"

import type { NextRequest } from "next/server"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import type {
  ExitChecklistData,
  ExitChecklistSignatureValue,
  HandoverAgendaData,
} from "@/types/exit-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_HEIGHT = 841.92
const PAGE_WIDTH = 595.28

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop
const nfc = (value?: string | null) => (value ?? "").normalize("NFC")

const SECTION_LEFT = 58
const SECTION_RIGHT = 520
const SECTION_WIDTH = SECTION_RIGHT - SECTION_LEFT

const ASSET_TABLE_LEFT = 58
const ASSET_TABLE_RIGHT = 520
const ASSET_TABLE_SPLIT = 332
const ASSET_TABLE_HEADER_HEIGHT = 15
const ASSET_TABLE_ROW_HEIGHT = 15
const DRAW_ASSET_TABLE_HEADER_TEXT = true

const PAGE1_SIGN_OFFSET = 7
const PAGE2_SIGN_OFFSET = 26

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
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

function formatCzDateTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
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
  page.drawText(normalized, { x: centerX - width / 2, y, size, font })
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
  fontSize = 9,
  lineHeight = 11.5
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
  drawText(page, fonts.bold, text, x + 0.35, y, size)
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
  drawTextFitted(
    page,
    fonts.bold,
    text,
    x + 0.35,
    y,
    maxWidth,
    baseSize,
    minSize
  )
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
    "Elektronicky potvrzeno v aplikaci On-Off-Boarding ÚMČ Praha 6.",
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
    nameSize: 9.0,
    dateSize: 7.5,
    noteSize: 5.2,
    lineHeight: 8.5,
  })
}

function drawSignatureBlockPage1(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  drawSignatureBlockBase(page, fonts, signer, signedAt, x, y, maxWidth, {
    nameSize: 8.5,
    dateSize: 7.0,
    noteSize: 4.8,
    lineHeight: 8.0,
  })
}

function drawSignatureBlockPage2(
  page: PDFPage,
  fonts: FontSet,
  signer: string | null | undefined,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  drawSignatureBlockBase(page, fonts, signer, signedAt, x, y, maxWidth, {
    nameSize: 8.5,
    dateSize: 7.0,
    noteSize: 4.8,
    lineHeight: 8.0,
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
    nameSize: 9.0,
    dateSize: 7.5,
    noteSize: 5.0,
    lineHeight: 8.5,
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
    drawBoldText(page, fonts, "Předmět", leftX + 7, cv(startTopY + 10.8), 9.0)
    drawBoldText(
      page,
      fonts,
      "Inventární číslo",
      splitX + 7,
      cv(startTopY + 10.8),
      9.0
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
      cv(rowTopY + 10.4),
      splitX - leftX - 16,
      8.3,
      5.2
    )
    drawTextFitted(
      page,
      fonts.regular,
      cleanText(row.inventoryNumber),
      splitX + 7,
      cv(rowTopY + 10.4),
      rightX - splitX - 16,
      8.3,
      5.2
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
  recipient: HandoverRecipientLike
): string {
  const name = cleanText(recipient.name)
  const email = cleanText(recipient.email)
  const personalNumber = cleanText(recipient.personalNumber)
  const main = [personalNumber, name].filter(Boolean).join(" — ")
  if (main && email) return `${main} (${email})`
  if (main) return main
  return email
}

function buildHandoverSummary(handover?: HandoverAgendaData): string[] {
  if (!handover?.includeHandoverAgenda) return []
  const lines: string[] = []

  if (handover.option1) {
    lines.push(
      "Předáno zaměstnancem do spisovny v e-spise nebo předáno na jiné funkční místo."
    )
  }

  if (handover.option2) {
    const recipients = getHandoverRecipients(handover)
      .map(formatHandoverRecipientForPdf)
      .filter(Boolean)
    if (recipients.length > 0) {
      lines.push("OI-KITT6 předá dokumenty na jiné funkční místo:")
      recipients.forEach((r, i) => {
        lines.push(`  ${i + 1}. ${r}`)
      })
    } else {
      lines.push("OI-KITT6 předá dokumenty na jiné funkční místo.")
    }
  }

  if (handover.option3) {
    const reason = cleanText(handover.option3Reason)
    const responsibleParty =
      handover.responsibleParty === "KITT6"
        ? "KITT6"
        : handover.responsibleParty === "OSS_KT"
          ? "OSS KT"
          : ""
    let line = "Agenda zatím zůstává na neobsazeném funkčním místě"
    if (reason) line += ` z důvodu: ${reason}`
    line += "."
    if (responsibleParty) line += ` Za dokumenty odpovídá ${responsibleParty}.`
    lines.push(line)
  }

  return lines
}

function createBlankPage(pdf: PDFDocument) {
  return pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
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

  ensureSpace(95)

  drawBoldText(activePage, fonts, "C.", SECTION_LEFT, y, 10.6)
  drawBoldText(
    activePage,
    fonts,
    "Předávaná agenda",
    SECTION_LEFT + 21,
    y,
    10.6
  )

  y -= 18

  y = drawParagraph(
    activePage,
    fonts.regular,
    "Elektronické dokumenty v e-spisu – elektronické předání dokumentů proběhne/proběhlo následujícím způsobem:",
    SECTION_LEFT,
    y,
    SECTION_WIDTH - 8,
    9,
    11.1
  )

  y -= 6

  const handoverLines = buildHandoverSummary(handover)

  if (handoverLines.length > 0) {
    for (const line of handoverLines) {
      ensureSpace(28)
      const isNumberedItem = /^\s+\d+\./.test(line)
      const indent = isNumberedItem ? SECTION_LEFT + 12 : SECTION_LEFT
      const maxW = isNumberedItem ? SECTION_WIDTH - 20 : SECTION_WIDTH - 8
      y = drawParagraph(
        activePage,
        fonts.regular,
        line.trim(),
        indent,
        y,
        maxW,
        8.9,
        10.8
      )
      y -= isNumberedItem ? 1 : 2
    }
    y -= 10
  } else {
    drawText(
      activePage,
      fonts.regular,
      "Není evidována žádná agenda k předání.",
      SECTION_LEFT,
      y,
      8.9
    )
    y -= 14
  }

  if (y - 70 < 45) {
    activePage = createBlankPage(pdf)
    y = cv(60)
  }

  y -= 8

  const labelX = SECTION_LEFT
  const roleX = 230
  const signatureX = 375

  drawText(
    activePage,
    fonts.regular,
    "Způsob předání agendy potvrzuje:",
    labelX,
    y,
    9
  )

  drawText(activePage, fonts.regular, "Vedoucí odboru", roleX, y, 9)

  if (managerName) {
    drawTextFitted(
      activePage,
      fonts.regular,
      cleanText(managerName),
      roleX,
      y - 16,
      145,
      9.0,
      6
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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
    const fontDir = path.join(process.cwd(), "public", "assets", "fonts")
    const regularFontPath = path.join(fontDir, "NotoSans-Regular.ttf")
    const boldFontPaths = [
      path.join(fontDir, "NotoSans-Bold.ttf"),
      path.join(fontDir, "NotoSans_Bold.ttf"),
      path.join(fontDir, "NotoSans-SemiBold.ttf"),
      path.join(fontDir, "NotoSans_Condensed-Bold.ttf"),
    ]

    const [tplBytes, regularFontBytes, boldFontBytes, checklist] =
      await Promise.all([
        fs.readFile(tplPath),
        fs.readFile(regularFontPath),
        readFirstExistingFile(boldFontPaths),
        getChecklistById(id, cookie),
      ])

    const pdf = await PDFDocument.load(tplBytes)
    pdf.registerFontkit(fontkit)

    const regularFont = await pdf.embedFont(regularFontBytes, { subset: false })
    const boldFont = boldFontBytes
      ? await pdf.embedFont(boldFontBytes, { subset: false })
      : regularFont

    const fonts: FontSet = { regular: regularFont, bold: boldFont }

    const page1 = pdf.getPage(0)
    const page2 = pdf.getPage(1)

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

    const headerValueX = 300
    const headerValueMax = 240

    drawBoldTextFitted(
      page1,
      fonts,
      cleanText(employeeName),
      headerValueX,
      cv(164),
      headerValueMax,
      9.6
    )
    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(personalNumber),
      headerValueX,
      cv(185),
      headerValueMax,
      9.6
    )
    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(department),
      headerValueX,
      cv(206),
      headerValueMax,
      9.6
    )
    drawTextFitted(
      page1,
      fonts.regular,
      cleanText(unitName),
      headerValueX,
      cv(227),
      headerValueMax,
      9.6
    )
    drawText(
      page1,
      fonts.regular,
      formatCzDate(employmentEndDate),
      headerValueX,
      cv(248),
      9.6
    )

    if (signatures?.employee?.signedByName) {
      drawSignatureBlockHeader(
        page1,
        fonts,
        signatures.employee.signedByName,
        signatures.employee.signedAt,
        52,
        cv(276),
        190
      )
    }

    if (signatures?.manager?.signedByName) {
      drawSignatureBlockHeader(
        page1,
        fonts,
        signatures.manager.signedByName,
        signatures.manager.signedAt,
        290,
        cv(276),
        200
      )
    }

    if (managerName) {
      drawTextFitted(
        page1,
        fonts.regular,
        cleanText(managerName),
        52,
        cv(417),
        158,
        8.7,
        6
      )
    }

    const resolutionCenterXPage1 = 386
    const resolutionCenterXPage2 = 386
    const signatureXPage1 = 418
    const signatureXPage2 = 418
    const signatureMaxWidthPage1 = 120
    const signatureMaxWidthPage2 = 120

    const rowYMap: Record<string, { page: number; y: number }> = {
      handoverProtocol: { page: 1, y: 392 },
      sneoChip: { page: 1, y: 439 },
      sneoRemote: { page: 1, y: 482 },
      electronicTicket: { page: 1, y: 525 },
      carChip: { page: 1, y: 568 },
      cashAdvance: { page: 1, y: 612 },
      serviceTools: { page: 1, y: 659 },
      serviceId: { page: 1, y: 711 },
      centralRegistry: { page: 2, y: 68 },
      classifiedDocs: { page: 2, y: 129 },
      fineBlocks: { page: 2, y: 188 },
      socialFundLoan: { page: 2, y: 261 },
      phoneCosts: { page: 2, y: 323 },
      itEquipment: { page: 2, y: 366 },
      espis: { page: 2, y: 409 },
      lawInfo: { page: 2, y: 453 },
    }

    for (const item of items) {
      const rowInfo = rowYMap[item.key]
      if (!rowInfo) continue

      const page = rowInfo.page === 1 ? page1 : page2
      const isSecondPage = rowInfo.page === 2
      const resolutionCenterX = isSecondPage
        ? resolutionCenterXPage2
        : resolutionCenterXPage1
      const signatureX = isSecondPage ? signatureXPage2 : signatureXPage1
      const signatureMaxWidth = isSecondPage
        ? signatureMaxWidthPage2
        : signatureMaxWidthPage1

      const yFromTop =
        rowInfo.y + (isSecondPage ? PAGE2_SIGN_OFFSET : PAGE1_SIGN_OFFSET)
      const signatureY = cv(yFromTop)
      const resolutionY = signatureY - 2

      if (item.key === "lawInfo" && !conflictOfInterest) {
        drawCenteredText(
          page,
          fonts.regular,
          "———",
          resolutionCenterX,
          resolutionY,
          8.8
        )
        drawText(page, fonts.regular, "———", signatureX, resolutionY, 8.8)
        continue
      }

      if (item.resolved === "YES") {
        drawCenteredText(
          page,
          fonts.regular,
          "Ano",
          resolutionCenterX,
          resolutionY,
          9.3
        )
      } else if (item.resolved === "NO") {
        drawCenteredText(
          page,
          fonts.regular,
          "Ne",
          resolutionCenterX,
          resolutionY,
          9.3
        )
      }

      if (item.signedAt && item.signedByName) {
        if (isSecondPage) {
          drawSignatureBlockPage2(
            page,
            fonts,
            item.signedByName,
            item.signedAt,
            signatureX,
            signatureY,
            signatureMaxWidth
          )
        } else {
          drawSignatureBlockPage1(
            page,
            fonts,
            item.signedByName,
            item.signedAt,
            signatureX,
            signatureY,
            signatureMaxWidth
          )
        }
      } else if (item.key === "lawInfo" && !conflictOfInterest) {
        drawText(page, fonts.regular, "———", signatureX, resolutionY, 8.8)
      }
    }

    const bTableStartTopY = 566
    const assetsTableBottomY = drawAssetsTableOnly({
      page: page2,
      fonts,
      assets,
      startTopY: bTableStartTopY,
    })

    const issuerTopY = assetsTableBottomY + 26

    drawText(
      page2,
      fonts.regular,
      "Za Odbor služeb potvrzuje správnost Výpisu:",
      SECTION_LEFT,
      cv(issuerTopY),
      9
    )

    if (signatures?.issuer?.signedByName) {
      drawSignatureBlockSection(
        page2,
        fonts,
        signatures.issuer.signedByName,
        signatures.issuer.signedAt,
        278,
        cv(issuerTopY + 2),
        165
      )
    }

    const handoverStartY = issuerTopY + 34

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
        page: page2,
        fonts,
        handover,
        managerName,
        handoverManagerSignature,
        startY: handoverStartY,
      })
    }

    const pdfBytes = await pdf.save()
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
