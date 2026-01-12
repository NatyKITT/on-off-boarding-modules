import fs from "fs/promises"
import path from "path"

import type { NextRequest } from "next/server"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib"

import type { ExitChecklistData } from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const nfc = (s?: string | null) => (s ?? "").normalize("NFC")

async function getChecklistById(
  id: number,
  cookie: string | null
): Promise<ExitChecklistData> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"
  const res = await fetch(`${base}/api/odchody/${id}/exit-checklist`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  })

  if (!res.ok) {
    throw new Error(
      `Nelze načíst výstupní list (GET ${base}/api/odchody/${id}/exit-checklist => ${res.status}).`
    )
  }

  const json = await res.json()
  if (!json.data) {
    throw new Error("Chybí data výstupního listu.")
  }

  return json.data as ExitChecklistData
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = u8
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

function formatCzDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

function formatCzDateTime(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string | null | undefined,
  x: number,
  y: number,
  size = 11
) {
  if (!text) return
  page.drawText(text.normalize("NFC"), {
    x,
    y,
    size,
    font,
  })
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
  let size = baseSize
  let width = font.widthOfTextAtSize(text, size)

  if (width > maxWidth) {
    size = (maxWidth / width) * size
    width = font.widthOfTextAtSize(text, size)
  }

  page.drawText(text.normalize("NFC"), {
    x,
    y,
    size,
    font,
  })
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  centerX: number,
  y: number,
  size: number
) {
  const width = font.widthOfTextAtSize(text, size)
  const x = centerX - width / 2
  page.drawText(text.normalize("NFC"), {
    x,
    y,
    size,
    font,
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    if (Number.isNaN(id)) {
      throw new Error("Neplatné ID odchodu.")
    }

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
    } = checklist

    drawText(page1, czFont, nfc(employeeName), 130, 738, 11)
    drawText(page1, czFont, nfc(personalNumber), 424, 738, 11)
    drawText(page1, czFont, nfc(department), 130, 716, 11)
    drawText(page1, czFont, nfc(unitName), 130, 700, 11)
    drawText(page1, czFont, formatCzDate(employmentEndDate), 260, 666, 11)

    const rowIndexByKey = new Map(
      EXIT_CHECKLIST_ROWS.map((r, idx) => [r.key, idx] as const)
    )

    const ROW_TOP_Y_P1 = 542
    const ROW_TOP_Y_P2 = 808
    const ROW_HEIGHT = 38

    const RES_COL_CENTER_X = 430
    const YESNO_FONT_SIZE = 10
    const YESNO_Y_OFFSET = -17

    const SIGN_COL_X = 465
    const SIGN_COL_MAX_WIDTH = 100

    const SIGN_NAME_Y_OFFSET = -6
    const SIGN_DATE_Y_OFFSET = -15
    const SIGN_NOTE_Y_OFFSET = -20

    for (const item of items) {
      const index = rowIndexByKey.get(item.key)
      if (index === undefined) continue

      const onFirstPage = index <= 12
      const page = onFirstPage ? page1 : page2
      const localIndex = onFirstPage ? index : index - 13
      const rowTopY =
        (onFirstPage ? ROW_TOP_Y_P1 : ROW_TOP_Y_P2) - localIndex * ROW_HEIGHT

      if (item.resolved === "YES") {
        drawCenteredText(
          page,
          czFont,
          "Ano",
          RES_COL_CENTER_X,
          rowTopY + YESNO_Y_OFFSET,
          YESNO_FONT_SIZE
        )
      } else if (item.resolved === "NO") {
        drawCenteredText(
          page,
          czFont,
          "Ne",
          RES_COL_CENTER_X,
          rowTopY + YESNO_Y_OFFSET,
          YESNO_FONT_SIZE
        )
      }

      if (item.signedAt && item.signedByName) {
        const name = nfc(item.signedByName)
        const dateStr = formatCzDateTime(item.signedAt)
        const note =
          "Elektronicky potvrzeno v aplikaci On-Off-Boarding ÚMČ Praha 6."

        drawTextFitted(
          page,
          czFont,
          name,
          SIGN_COL_X,
          rowTopY + SIGN_NAME_Y_OFFSET,
          SIGN_COL_MAX_WIDTH,
          9
        )

        drawTextFitted(
          page,
          czFont,
          dateStr,
          SIGN_COL_X,
          rowTopY + SIGN_DATE_Y_OFFSET,
          SIGN_COL_MAX_WIDTH,
          8
        )

        drawTextFitted(
          page,
          czFont,
          note,
          SIGN_COL_X,
          rowTopY + SIGN_NOTE_Y_OFFSET,
          SIGN_COL_MAX_WIDTH,
          5
        )
      }
    }

    const ASSETS_START_Y = 589
    const ASSETS_ROW_HEIGHT = 20
    const MAX_ASSET_ROWS = 11

    assets.slice(0, MAX_ASSET_ROWS).forEach((asset, idx) => {
      const y = ASSETS_START_Y - idx * ASSETS_ROW_HEIGHT
      if (asset.subject) {
        drawText(page2, czFont, nfc(asset.subject), 68, y, 10)
      }
      if (asset.inventoryNumber) {
        drawText(page2, czFont, nfc(asset.inventoryNumber), 368, y, 10)
      }
    })

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
