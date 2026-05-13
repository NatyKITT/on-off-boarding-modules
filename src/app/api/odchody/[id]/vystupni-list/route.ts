import fs from "fs/promises"
import path from "path"

import type { NextRequest } from "next/server"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib"

import type {
  ExitChecklistData,
  HandoverAgendaData,
} from "@/types/exit-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const H = 841.92
const cv = (y: number) => H - y

const nfc = (s?: string | null) => (s ?? "").normalize("NFC")

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
  if (isNaN(d.getTime())) return ""
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

function formatCzDateTime(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
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
  baseSize: number
) {
  if (!text) return
  let size = baseSize
  if (font.widthOfTextAtSize(nfc(text), size) > maxWidth) {
    size = (maxWidth / font.widthOfTextAtSize(nfc(text), size)) * size
  }
  page.drawText(nfc(text), { x, y, size, font })
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  size: number
) {
  const w = font.widthOfTextAtSize(nfc(text), size)
  page.drawText(nfc(text), { x: centerX - w / 2, y, size, font })
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
    } else {
      if (current) lines.push(current)
      current = word
    }
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
  fontSize = 10,
  lineHeight = 13
): number {
  for (const line of wrapText(text, font, fontSize, maxWidth)) {
    drawText(page, font, line, x, y, fontSize)
    y -= lineHeight
  }
  return y
}

function drawSignatureBlock(
  page: PDFPage,
  font: PDFFont,
  signer: string,
  signedAt: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number
) {
  const name = cleanText(signer)
  if (!name) return

  const nameLines = wrapText(name, font, 9, maxWidth)
  let curY = y
  for (const line of nameLines) {
    drawText(page, font, line, x, curY, 9)
    curY -= 10
  }

  if (signedAt) {
    drawText(page, font, formatCzDateTime(signedAt), x, curY, 8)
    curY -= 9
    const noteLines = wrapText(
      "Elektronicky potvrzeno v aplikaci On-Off-Boarding ÚMČ Praha 6.",
      font,
      5,
      maxWidth
    )
    for (const line of noteLines) {
      drawText(page, font, line, x, curY, 5)
      curY -= 6
    }
  } else {
    const noteLines = wrapText(
      "Elektronicky potvrzeno v aplikaci On-Off-Boarding ÚMČ Praha 6.",
      font,
      5,
      maxWidth
    )
    for (const line of noteLines) {
      drawText(page, font, line, x, curY, 5)
      curY -= 6
    }
  }
}

function buildHandoverSummary(handover?: HandoverAgendaData): string[] {
  if (!handover?.includeHandoverAgenda) return []
  const lines: string[] = []

  if (handover.option1) {
    lines.push(
      "Elektronické dokumenty v e-spisu byly předány zaměstnancem do spisovny v e-spisu nebo předány na jiné funkční místo."
    )
  }

  if (handover.option2) {
    const target = cleanText(handover.option2Target)
    const num = cleanText(handover.option2TargetPositionNum)
    if (target && num && !target.includes(num)) {
      lines.push(
        `OI-KITT6 předá dokumenty na jiné funkční místo: ${num} — ${target}.`
      )
    } else if (target) {
      lines.push(`OI-KITT6 předá dokumenty na jiné funkční místo: ${target}.`)
    } else {
      lines.push("OI-KITT6 předá dokumenty na jiné funkční místo.")
    }
  }

  if (handover.option3) {
    const reason = cleanText(handover.option3Reason)
    const resp =
      handover.responsibleParty === "KITT6"
        ? "KITT6"
        : handover.responsibleParty === "OSS_KT"
          ? "OSS KT"
          : ""
    let s = "Agenda zatím zůstává na neobsazeném funkčním místě"
    if (reason) s += ` z důvodu: ${reason}`
    s += "."
    if (resp) s += ` Za dokumenty odpovídá ${resp}.`
    lines.push(s)
  }

  return lines
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
    const fontPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "fonts",
      "NotoSans-Regular.ttf"
    )

    const [tplBytes, fontBytes, checklist] = await Promise.all([
      fs.readFile(tplPath),
      fs.readFile(fontPath),
      getChecklistById(id, cookie),
    ])

    const pdf = await PDFDocument.load(tplBytes)
    pdf.registerFontkit(fontkit)
    const czFont = await pdf.embedFont(fontBytes, { subset: false })

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
    } = checklist

    const VAL_X = 300
    const VAL_MAX = 250

    drawTextFitted(
      page1,
      czFont,
      nfc(employeeName ?? ""),
      VAL_X,
      cv(143),
      VAL_MAX,
      10
    )

    drawTextFitted(
      page1,
      czFont,
      nfc(personalNumber ?? ""),
      VAL_X,
      cv(165),
      VAL_MAX,
      10
    )

    drawTextFitted(
      page1,
      czFont,
      nfc(department ?? ""),
      VAL_X,
      cv(186),
      VAL_MAX,
      10
    )

    drawTextFitted(
      page1,
      czFont,
      nfc(unitName ?? ""),
      VAL_X,
      cv(207),
      VAL_MAX,
      10
    )

    drawText(page1, czFont, formatCzDate(employmentEndDate), VAL_X, cv(228), 10)

    if (signatures?.employee?.signedByName) {
      drawSignatureBlock(
        page1,
        czFont,
        signatures.employee.signedByName,
        signatures.employee.signedAt,
        63,
        cv(256),
        220
      )
    }

    if (signatures?.manager?.signedByName) {
      drawSignatureBlock(
        page1,
        czFont,
        signatures.manager.signedByName,
        signatures.manager.signedAt,
        300,
        cv(256),
        245
      )
    }

    if (managerName) {
      drawTextFitted(page1, czFont, nfc(managerName), 63, cv(398), 155, 8)
    }

    const RES_CENTER_X = 398
    const SIGN_X = 430
    const SIGN_MAX_W = 121

    const rowYMap: Record<string, { page: number; y: number }> = {
      handoverProtocol: { page: 1, y: 387 },
      sneoChip: { page: 1, y: 434 },
      sneoRemote: { page: 1, y: 477 },
      electronicTicket: { page: 1, y: 520 },
      carChip: { page: 1, y: 563 },
      cashAdvance: { page: 1, y: 607 },
      serviceTools: { page: 1, y: 654 },
      serviceId: { page: 1, y: 706 },
      centralRegistry: { page: 2, y: 63 },
      classifiedDocs: { page: 2, y: 124 },
      fineBlocks: { page: 2, y: 183 },
      socialFundLoan: { page: 2, y: 256 },
      phoneCosts: { page: 2, y: 318 },
      itEquipment: { page: 2, y: 361 },
      espis: { page: 2, y: 404 },
      lawInfo: { page: 2, y: 448 },
    }

    for (const item of items) {
      const rowInfo = rowYMap[item.key]
      if (!rowInfo) continue

      const page = rowInfo.page === 1 ? page1 : page2
      const libY = cv(rowInfo.y + 3)

      if (item.key === "lawInfo" && !conflictOfInterest) {
        drawCenteredText(page, czFont, "———", RES_CENTER_X, libY, 9)
        drawText(page, czFont, "———", SIGN_X, libY, 9)
        continue
      }

      if (item.resolved === "YES") {
        drawCenteredText(page, czFont, "Ano", RES_CENTER_X, libY, 10)
      } else if (item.resolved === "NO") {
        drawCenteredText(page, czFont, "Ne", RES_CENTER_X, libY, 10)
      }

      if (item.signedAt && item.signedByName) {
        drawSignatureBlock(
          page,
          czFont,
          item.signedByName,
          item.signedAt,
          SIGN_X,
          libY + 6,
          SIGN_MAX_W
        )
      } else if (item.key === "lawInfo" && !item.signedAt) {
        drawText(page, czFont, "———", SIGN_X, libY, 9)
      }
    }

    assets.slice(0, 8).forEach((asset, idx) => {
      const pdfY = 558 + idx * 14
      if (asset.subject) {
        drawTextFitted(
          page2,
          czFont,
          nfc(asset.subject),
          62,
          cv(pdfY + 8),
          285,
          9
        )
      }
      if (asset.inventoryNumber) {
        drawText(
          page2,
          czFont,
          nfc(asset.inventoryNumber),
          358,
          cv(pdfY + 8),
          9
        )
      }
    })

    if (signatures?.issuedDate) {
      drawText(
        page2,
        czFont,
        formatCzDate(signatures.issuedDate),
        165,
        cv(673),
        10
      )
    }

    if (signatures?.issuer?.signedByName) {
      drawSignatureBlock(
        page2,
        czFont,
        signatures.issuer.signedByName,
        signatures.issuer.signedAt,
        420,
        cv(671),
        130
      )
    }

    const handoverLines = buildHandoverSummary(handover)
    if (handoverLines.length > 0) {
      let y = cv(738)
      for (const line of handoverLines) {
        y = drawParagraph(page2, czFont, line, 65, y, 489, 9, 12)
        y -= 4
      }
    }

    const u8 = await pdf.save()
    return new Response(toArrayBuffer(u8), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Vystupni-list-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[vystupni-list] ERROR:", message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
