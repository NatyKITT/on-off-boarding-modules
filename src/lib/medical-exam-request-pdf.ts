import fs from "fs/promises"
import path from "path"

import { PDFDocument, rgb, type PDFFont } from "pdf-lib"

import { prisma } from "@/lib/db"
import { joinNameWithTitles } from "@/lib/format-name"
import {
  MEDICAL_EXAM_TYPE_OPTIONS,
  MEDICAL_EXAM_WORK_CATEGORY_OPTIONS,
} from "@/lib/medical-exam-request-shared"
import { loadPdfFonts } from "@/lib/pdf-fonts"

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "assets",
  "docs",
  "Žádost-o-pracovnělékařskou-prohlídku.pdf"
)

const PAGE_WIDTH = 595.32
const PAGE_HEIGHT = 841.92

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop

const LEFT_X = 80
const RIGHT_X = PAGE_WIDTH - 50
const CONTENT_WIDTH = RIGHT_X - LEFT_X

const LABEL_SIZE = 10
const VALUE_SIZE = 10
const LINE_HEIGHT = 15
const SECTION_GAP = 9

const TEXT_BLACK = rgb(0.07, 0.07, 0.07)

const WORK_CATEGORY_OPTIONS = MEDICAL_EXAM_WORK_CATEGORY_OPTIONS
const EXAM_TYPE_OPTIONS: readonly string[] = MEDICAL_EXAM_TYPE_OPTIONS

function escapeText(value: string): string {
  return value.replace(/\t/g, " ")
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function formatCzDate(value: Date | string | null | undefined): string {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("cs-CZ")
}

function splitLongToken(
  font: PDFFont,
  token: string,
  size: number,
  maxWidth: number
): string[] {
  const chunks: string[] = []
  let current = ""

  for (const char of token) {
    const candidate = current + char
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current)
      current = char
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (current) {
        lines.push(current)
        current = ""
      }
      const pieces = splitLongToken(font, word, size, maxWidth)
      for (let i = 0; i < pieces.length - 1; i++) lines.push(pieces[i])
      current = pieces[pieces.length - 1] ?? ""
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) lines.push(current)
  return lines.length ? lines : [""]
}

export async function buildMedicalExamRequestPdf(
  onboardingId: number
): Promise<{ buffer: Buffer; employeeName: string } | null> {
  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: {
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      positionName: true,
      medicalExamJobTitle: true,
      medicalExamJobDescription: true,
      medicalExamWorkRegime: true,
      medicalExamRiskFactors: true,
      medicalExamWorkCategory: true,
      medicalExamProfessionalRisk: true,
      medicalExamType: true,
      medicalExamExamReason: true,
      medicalExamBirthDate: true,
      medicalExamAddress: true,
      documents: {
        where: { type: "PERSONAL_QUESTIONNAIRE" },
        select: { data: true },
        take: 1,
      },
    },
  })

  if (!onboarding) return null

  const employeeName = joinNameWithTitles(onboarding)

  const questionnaireData =
    (onboarding.documents[0]?.data as Record<string, unknown> | null) ?? {}

  const addressParts = [
    [
      sanitizeText(questionnaireData.permanentStreet),
      sanitizeText(questionnaireData.permanentHouseNumber),
    ]
      .filter(Boolean)
      .join(" "),
    [
      sanitizeText(questionnaireData.permanentPostcode),
      sanitizeText(questionnaireData.permanentCity),
    ]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean)

  const birthDate = formatCzDate(
    sanitizeText(questionnaireData.birthDate) || onboarding.medicalExamBirthDate
  )
  const permanentAddress =
    addressParts.join(", ") || sanitizeText(onboarding.medicalExamAddress)

  const workCategory = sanitizeText(onboarding.medicalExamWorkCategory)
  const examType =
    sanitizeText(onboarding.medicalExamType) || EXAM_TYPE_OPTIONS[0]
  const today = formatCzDate(new Date())

  const templateBytes = await fs.readFile(TEMPLATE_PATH)
  const pdfDoc = await PDFDocument.load(templateBytes)
  const page = pdfDoc.getPage(0)
  const fonts = await loadPdfFonts(pdfDoc)

  let y = 270

  function drawLabel(text: string) {
    page.drawText(escapeText(text), {
      x: LEFT_X,
      y: cv(y),
      size: LABEL_SIZE,
      font: fonts.bold,
      color: TEXT_BLACK,
    })
    y += LINE_HEIGHT
  }

  function drawLabelValueLine(label: string, value: string) {
    page.drawText(escapeText(label), {
      x: LEFT_X,
      y: cv(y),
      size: LABEL_SIZE,
      font: fonts.bold,
      color: TEXT_BLACK,
    })
    const labelWidth = fonts.bold.widthOfTextAtSize(label, LABEL_SIZE)
    page.drawText(escapeText(value || "—"), {
      x: LEFT_X + labelWidth + 8,
      y: cv(y),
      size: VALUE_SIZE,
      font: fonts.regular,
      color: TEXT_BLACK,
    })
    y += LINE_HEIGHT
  }

  function drawLabelThenWrappedValue(label: string, value: string) {
    drawLabel(label)
    const lines = wrapText(
      fonts.regular,
      value || "—",
      VALUE_SIZE,
      CONTENT_WIDTH
    )
    for (const line of lines) {
      page.drawText(escapeText(line), {
        x: LEFT_X,
        y: cv(y),
        size: VALUE_SIZE,
        font: fonts.regular,
        color: TEXT_BLACK,
      })
      y += LINE_HEIGHT
    }
  }

  function drawChoiceRow(label: string, options: string[], selected: string) {
    drawLabel(label)
    let x = LEFT_X
    for (const option of options) {
      const isSelected = option === selected
      const font = isSelected ? fonts.bold : fonts.regular
      const text = isSelected ? `[x] ${option}` : `[ ] ${option}`
      page.drawText(escapeText(text), {
        x,
        y: cv(y),
        size: VALUE_SIZE,
        font,
        color: TEXT_BLACK,
      })
      x += font.widthOfTextAtSize(text, VALUE_SIZE) + 16
    }
    y += LINE_HEIGHT
  }

  drawLabel("Zaměstnanec/osoba ucházející se o zaměstnání:")
  drawLabelValueLine("Jméno, příjmení, titul:", employeeName)
  drawLabelValueLine("Datum narození:", birthDate)
  drawLabelThenWrappedValue("Adresa místa trvalého pobytu:", permanentAddress)

  y += SECTION_GAP

  drawLabelValueLine(
    "Pracovní zařazení (nynější/navrhované):",
    sanitizeText(onboarding.medicalExamJobTitle) ||
      sanitizeText(onboarding.positionName)
  )
  drawLabelThenWrappedValue(
    "Druh práce (stručný popis pracovní činnosti):",
    sanitizeText(onboarding.medicalExamJobDescription)
  )
  drawLabelValueLine(
    "Režim práce:",
    sanitizeText(onboarding.medicalExamWorkRegime)
  )
  drawLabelThenWrappedValue(
    "Rizikové faktory pracovních podmínek (část I. příloha 2 vyhlášky č. 79/2013 Sb.):",
    sanitizeText(onboarding.medicalExamRiskFactors) || "Ne"
  )

  y += SECTION_GAP

  drawChoiceRow(
    "Kategorie práce (§ 37 zákona č. 258/2000 Sb.)*):",
    WORK_CATEGORY_OPTIONS,
    workCategory
  )
  drawLabelThenWrappedValue(
    "Profesní riziko (vyhláška č. 432/2003 Sb., část II. přílohy 2 vyhlášky č. 79/2013 Sb.):",
    sanitizeText(onboarding.medicalExamProfessionalRisk) || "Ne"
  )

  y += SECTION_GAP

  drawLabel("Druh prohlídky*):")
  for (const option of EXAM_TYPE_OPTIONS) {
    const isSelected = option === examType
    const font = isSelected ? fonts.bold : fonts.regular
    const text = isSelected ? `[x] ${option}` : `[ ] ${option}`
    page.drawText(escapeText(text), {
      x: LEFT_X,
      y: cv(y),
      size: VALUE_SIZE,
      font,
      color: TEXT_BLACK,
    })
    y += LINE_HEIGHT
  }
  drawLabelThenWrappedValue(
    `Důvod k provedení ${examType} prohlídky:`,
    sanitizeText(onboarding.medicalExamExamReason)
  )

  y += SECTION_GAP

  const noticeLines = wrapText(
    fonts.regular,
    "Zaměstnavatel tímto současně pověřuje shora jmenovaného zaměstnance/osobu ucházející se o zaměstnání k převzetí lékařského posudku vydaného na základě této žádosti.",
    VALUE_SIZE,
    CONTENT_WIDTH
  )
  for (const line of noticeLines) {
    page.drawText(escapeText(line), {
      x: LEFT_X,
      y: cv(y),
      size: VALUE_SIZE,
      font: fonts.regular,
      color: TEXT_BLACK,
    })
    y += LINE_HEIGHT
  }

  y += SECTION_GAP * 2

  drawLabelValueLine("Datum:", today)

  page.drawLine({
    start: { x: RIGHT_X - 180, y: cv(y) - 2 },
    end: { x: RIGHT_X, y: cv(y) - 2 },
    thickness: 0.7,
    color: TEXT_BLACK,
  })
  y += LINE_HEIGHT
  page.drawText("otisk razítka a podpis zaměstnavatele", {
    x: RIGHT_X - 170,
    y: cv(y),
    size: 8,
    font: fonts.regular,
    color: TEXT_BLACK,
  })

  const pdfBytes = await pdfDoc.save()

  return { buffer: Buffer.from(pdfBytes), employeeName }
}
