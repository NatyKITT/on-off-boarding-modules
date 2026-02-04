import { readFile } from "fs/promises"
import path from "path"

import { NextRequest } from "next/server"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = u8
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ""
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return typeof value === "string" ? value : ""
    }
    return date.toLocaleDateString("cs-CZ")
  } catch {
    return typeof value === "string" ? value : ""
  }
}

type DocumentInfo = {
  id: number
  status: string
  completedAt: Date | string | null
  employeeName: string
}

type PayrollChildItem = {
  childName?: string | null
  childBirthDate?: string | null
}

type PayrollInfoData = {
  fullName?: string | null
  maidenName?: string | null
  birthPlace?: string | null
  birthNumber?: string | null
  maritalStatus?:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "REGISTERED"
    | "UNSTATED"
    | string
  permanentStreet?: string | null
  permanentHouseNumber?: string | null
  permanentCity?: string | null
  permanentPostcode?: string | null
  children?: PayrollChildItem[]
  healthInsuranceCompany?: string | null
  bankAccountNumber?: string | null
  bankName?: string | null
  confirmTruthfulness?: boolean
  signatureDate?: string | null
  [key: string]: unknown
}

function drawSectionHeader(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  pageWidth: number,
  margin: number
): number {
  const rectHeight = 18
  const rectY = y - 4

  page.drawRectangle({
    x: margin,
    y: rectY,
    width: pageWidth - 2 * margin,
    height: rectHeight,
    color: rgb(0.95, 0.95, 0.95),
  })

  page.drawText(text, {
    x: margin + 8,
    y,
    size: 12,
    font,
    color: rgb(0.15, 0.39, 0.92),
  })

  return y - (rectHeight + 8)
}

function drawField(
  page: PDFPage,
  label: string,
  value: string | null | undefined,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  margin: number
): number {
  const safeValue = value ?? ""

  page.drawText(label, {
    x: margin + 10,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  })

  if (safeValue) {
    page.drawText(safeValue, {
      x: margin + 10,
      y: y - 14,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    })
    return y - 28
  }

  return y - 22
}

function generatePayrollInfoPDF(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as PayrollInfoData

  const pageWidth = 595
  const pageHeight = 842
  const margin = 40

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin - 40

  const checkPage = () => {
    if (y < margin + 80) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin - 40
    }
  }

  const title = "Nástup zaměstnance do pracovního poměru"
  const titleSize = 16
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  const titleX = (pageWidth - titleWidth) / 2

  page.drawText(title, {
    x: titleX,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 20

  const subtitle = "(nezbytné zákonné údaje pro vedení mzdové agendy)"
  const subtitleSize = 10
  const subtitleWidth = font.widthOfTextAtSize(subtitle, subtitleSize)
  const subtitleX = (pageWidth - subtitleWidth) / 2

  page.drawText(subtitle, {
    x: subtitleX,
    y,
    size: subtitleSize,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 35

  const introLines = [
    "Vážená paní, vážený pane,",
    "",
    "dovolujeme si Vás požádat o vyplnění následujících údajů pro účely",
    "zpracování personální a mzdové agendy. Vaše údaje budou k dispozici",
    "pouze tajemníkovi úřadu, zaměstnancům personálního oddělení, mzdové",
    "účtárně a HR specialistce. Data jsou přenášena šifrovaná a uložena",
    "na zabezpečeném úložišti.",
    "",
    "Dotazník Vám zabere maximálně 30 minut.",
    "",
    "Děkujeme a těšíme se na spolupráci.",
    "",
    "Městská část Praha 6, Úřad městské části, Čs. armády 23, 160 52",
    "Praha 6, IČO 00063703",
    "",
    "Personální oddělení, v přímém řízení tajemníka",
    "Oddělení účetnictví, Odbor ekonomický",
  ]

  introLines.forEach((line) => {
    checkPage()
    if (line === "") {
      y -= 8
    } else {
      page.drawText(line, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 12
    }
  })

  y -= 15
  checkPage()

  if (docInfo.employeeName) {
    page.drawText(docInfo.employeeName, {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    })
    y -= 18
  }

  page.drawText(`ID: ${docInfo.id} | Stav: ${docInfo.status}`, {
    x: margin,
    y,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })
  y -= 12

  if (docInfo.completedAt) {
    page.drawText(`Vyplněno: ${formatDate(docInfo.completedAt)}`, {
      x: margin,
      y,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    })
    y -= 20
  } else {
    y -= 8
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 25

  checkPage()
  y = drawSectionHeader(
    page,
    "1. Základní údaje zaměstnance",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Jméno a příjmení",
    data.fullName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Rodné příjmení",
    data.maidenName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Místo narození",
    data.birthPlace ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Rodné číslo",
    data.birthNumber ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  const maritalStatusMap: Record<string, string> = {
    SINGLE: "Svobodný/á",
    MARRIED: "Vdaná / ženatý",
    DIVORCED: "Rozvedený/á",
    WIDOWED: "Vdova / vdovec",
    REGISTERED: "Registrované partnerství",
    UNSTATED: "Neuvádím",
  }

  const maritalText =
    data.maritalStatus && maritalStatusMap[data.maritalStatus]
      ? maritalStatusMap[data.maritalStatus]
      : (data.maritalStatus ?? "")

  y = drawField(page, "Rodinný stav", maritalText, y, font, fontBold, margin)
  checkPage()

  checkPage()
  y = drawSectionHeader(page, "Trvalé bydliště", y, fontBold, pageWidth, margin)

  const address = [
    data.permanentStreet,
    data.permanentHouseNumber,
    data.permanentCity,
    data.permanentPostcode,
  ]
    .filter(Boolean)
    .join(", ")

  y = drawField(page, "Adresa", address, y, font, fontBold, margin)
  checkPage()

  const childrenList: PayrollChildItem[] =
    Array.isArray(data.children) && data.children.length > 0
      ? data.children.filter((c) => c.childName || c.childBirthDate)
      : []

  if (childrenList.length > 0) {
    checkPage()
    y = drawSectionHeader(
      page,
      "Jméno dětí a datum narození (pro účely daňového zvýhodnění)",
      y,
      fontBold,
      pageWidth,
      margin
    )

    childrenList.forEach((child, idx) => {
      checkPage()
      page.drawText(`${idx + 1}. Dítě:`, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 16

      y = drawField(
        page,
        "Jméno dítěte",
        child.childName ?? "",
        y,
        font,
        fontBold,
        margin
      )
      checkPage()

      y = drawField(
        page,
        "Datum narození",
        formatDate(child.childBirthDate ?? ""),
        y,
        font,
        fontBold,
        margin
      )
      y -= 8
    })
  }

  checkPage()
  y = drawSectionHeader(
    page,
    "2. Zdravotní pojišťovna",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Název zdravotní pojišťovny",
    data.healthInsuranceCompany ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(
    page,
    "3. Zasílání platu/odměny na bankovní účet",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Číslo účtu",
    data.bankAccountNumber ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Bankovní ústav",
    data.bankName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(page, "Prohlášení", y, fontBold, pageWidth, margin)

  const truthfulText =
    data.confirmTruthfulness === true
      ? "Ano"
      : data.confirmTruthfulness === false
        ? "Ne"
        : ""

  y = drawField(
    page,
    "Potvrzuji prohlášení",
    truthfulText,
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  drawField(
    page,
    "Datum",
    formatDate(data.signatureDate ?? ""),
    y,
    font,
    fontBold,
    margin
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { hash: string } }
) {
  const hash = params.hash

  if (!hash || typeof hash !== "string") {
    return new Response(
      JSON.stringify({ message: "Neplatný přístupový hash." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    const doc = await prisma.employmentDocument.findFirst({
      where: { accessHash: hash },
      select: {
        id: true,
        type: true,
        status: true,
        data: true,
        createdAt: true,
        completedAt: true,
        onboarding: {
          select: {
            name: true,
            surname: true,
          },
        },
      },
    })

    if (!doc) {
      return new Response(
        JSON.stringify({ message: "Dokument nebyl nalezen." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    if (doc.type !== "PAYROLL_INFO") {
      return new Response(
        JSON.stringify({
          message: "Tento typ dokumentu není dostupný přes veřejný endpoint.",
          allowedTypes: ["PAYROLL_INFO"],
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)

    const fontPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "fonts",
      "NotoSans-Regular.ttf"
    )
    const fontBytes = await readFile(fontPath)
    const font = await pdfDoc.embedFont(fontBytes)
    const fontBold = font

    const docInfo: DocumentInfo = {
      id: doc.id,
      status: doc.status,
      completedAt: doc.completedAt,
      employeeName: [doc.onboarding?.name, doc.onboarding?.surname]
        .filter(Boolean)
        .join(" "),
    }

    generatePayrollInfoPDF(pdfDoc, font, fontBold, doc.data, docInfo)

    const bytes = await pdfDoc.save()
    const arrayBuffer = toArrayBuffer(bytes)

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="dokument-${doc.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const details =
      error instanceof Error ? error.message : JSON.stringify(error)
    console.error("PDF generation error", error)

    return new Response(
      JSON.stringify({
        message: "Nepodařilo se vygenerovat PDF.",
        details,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
