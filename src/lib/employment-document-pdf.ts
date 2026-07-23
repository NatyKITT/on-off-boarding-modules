import fs from "fs/promises"
import path from "path"

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { prisma } from "@/lib/db"
import { loadPdfFonts } from "@/lib/pdf-fonts"

const BORDER_GRAY = rgb(0.82, 0.82, 0.82)
const LABEL_GRAY = rgb(0.4, 0.4, 0.4)
const TEXT_BLACK = rgb(0.1, 0.1, 0.1)

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "assets",
  "docs",
  "dotaznik.pdf"
)

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.92

const cv = (yFromTop: number) => PAGE_HEIGHT - yFromTop

const CONTENT_LEFT = 47
const CONTENT_RIGHT = 543
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT

const HEADER_VALUE_X = 292
const HEADER_VALUE_MAX_WIDTH = 244

const TABLE_ROW_Y = {
  name: 158.2,
  personalNumber: 179.8,
  position: 201.4,
  department: 223.0,
  unit: 244.6,
  startDate: 266.2,
  filledDate: 287.8,
}

const TITLE_Y = 112
const TITLE_SIZE = 14

const SECTION_START_Y_PAGE1 = 336
const HEADER_VALUE_Y_OFFSET = 5
const CONTINUATION_START_Y = 56

const FIELD_LABEL_SIZE = 8.5
const FIELD_VALUE_SIZE = 10.5
const FIELD_ROW_HEIGHT = 26
const ITEM_LABEL_HEIGHT = 16
const ITEM_DIVIDER_GAP = 10
const SECTION_HEADER_HEIGHT = 22
const SECTION_GAP = 12
const SECTION_PADDING = 10
const SECTION_TOP_PAD = 14
const SECTION_BOTTOM_PAD = 12

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

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return ""
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return typeof value === "string" ? value : ""
    }
    return date.toLocaleString("cs-CZ", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return typeof value === "string" ? value : ""
  }
}

function drawTextFitted(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  minSize = 6
) {
  const normalized = (text ?? "").trim()
  if (!normalized) return

  let size = baseSize
  const width = font.widthOfTextAtSize(normalized, size)

  if (width > maxWidth) {
    size = Math.max(minSize, (maxWidth / width) * size)
  }

  page.drawText(normalized, { x, y, size, font, color: TEXT_BLACK })
}

type DocumentInfo = {
  id: number
  status: string
  completedAt: Date | string | null
  employeeName: string
  titleBefore?: string | null
  titleAfter?: string | null
  personalNumber?: string | null
  positionName?: string | null
  department?: string | null
  unitName?: string | null
  employmentStart?: Date | string | null
}

type ChildCareItem = {
  childName?: string | null
  childBirthDate?: string | null
  from?: string | null
  to?: string | null
}

type MilitaryServiceItem = {
  service?: "BASIC" | "ALTERNATIVE" | "CIVIL" | string | null
  from?: string | null
  to?: string | null
  ongoing?: boolean | null
}

type CloseRelativeCareItem = {
  personName?: string | null
  dependencyLevel?: "III" | "IV" | string | null
  from?: string | null
  to?: string | null
}

type DoctoralStudyItem = {
  schoolName?: string | null
  studyProgram?: string | null
  from?: string | null
  to?: string | null
}

type UnpaidLeaveItem = {
  reason?: string | null
  from?: string | null
  to?: string | null
}

type ExperienceItem = {
  employer?: string | null
  jobType?: string | null
  employmentType?: string | null
  from?: string | null
  to?: string | null
  ongoing?: boolean | null
}

type AffidavitData = {
  experience?: ExperienceItem[]
  noExperience?: boolean
  militaryService?: MilitaryServiceItem[]
  maternityParental?: ChildCareItem[]
  continuousCare?: ChildCareItem[]
  disabledChildCare?: ChildCareItem[]
  closeRelativeCare?: CloseRelativeCareItem[]
  doctoralStudy?: DoctoralStudyItem[]
  unpaidLeave?: UnpaidLeaveItem[]
  isTruthful?: boolean
  [key: string]: unknown
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
  birthDay?: string | null
  birthMonth?: string | null
  birthYear?: string | null
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

type LanguageEntry = {
  name?: string | null
  level?: string | null
}

type EducationEntry = {
  level?: string | null
  schoolType?: string | null
  semesters?: string | null
  studyForm?: string | null
  graduationYear?: string | null
  examType?: string | null
}

type PersonalQuestionnaireData = {
  lastName?: string | null
  firstName?: string | null
  titleBefore?: string | null
  titleAfter?: string | null
  academicDegrees?: string | null
  maidenName?: string | null
  otherSurnames?: string | null
  birthDate?: string | null
  birthNumber?: string | null
  birthPlace?: string | null
  birthDistrict?: string | null
  birthState?: string | null
  phone?: string | null
  citizenship?: string | null
  dataBoxId?: string | null
  maritalStatus?:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "REGISTERED"
    | "UNSTATED"
    | string
  foreignPermitFrom?: string | null
  foreignPermitTo?: string | null
  foreignPermitAuthority?: string | null
  permanentStreet?: string | null
  permanentHouseNumber?: string | null
  permanentCity?: string | null
  permanentPostcode?: string | null
  correspondenceStreet?: string | null
  correspondenceHouseNumber?: string | null
  correspondenceCity?: string | null
  correspondencePostcode?: string | null
  healthInsuranceCompany?: string | null
  bankAccountNumber?: string | null
  bankName?: string | null
  maintenanceInfo?: string | null
  receivesPensionBenefits?: boolean
  typePensionBenefits?: string | null
  isDisabledPerson?: boolean
  disabilityDegree?: "NONE" | "I" | "II" | "III" | string
  education?: EducationEntry[]
  languages?: LanguageEntry[]
  dataBoxDelivery?: boolean
  hasCertificateManagement?: boolean
  hasCertificateSpecial?: boolean
  certificateSpecialName?: string | null
  hasCertificateTraining?: boolean
  hasCertificateGeneral?: boolean
  familyRelations?: string | null
  finalRequestPayrollTransfer?: boolean
  finalReadAndUnderstood?: boolean
  finalTruthfulnessConfirm?: boolean
  [key: string]: unknown
}

type Fonts = { regular: PDFFont; bold: PDFFont }

type PdfCtx = {
  pdf: PDFDocument
  fonts: Fonts
  page: PDFPage
  y: number
  sectionIndex: number
  employeeDisplayName: string
}

function letterFor(index: number): string {
  if (index <= 26) return String.fromCharCode(64 + index)

  const first = Math.floor((index - 1) / 26)
  const second = ((index - 1) % 26) + 1
  return `${letterFor(first)}${letterFor(second)}`
}

function drawPageTitle(page: PDFPage, fonts: Fonts, title: string) {
  const text = title.toLocaleUpperCase("cs-CZ")
  const textWidth = fonts.bold.widthOfTextAtSize(text, TITLE_SIZE)

  page.drawText(text, {
    x: (PAGE_WIDTH - textWidth) / 2,
    y: cv(TITLE_Y),
    size: TITLE_SIZE,
    font: fonts.bold,
    color: TEXT_BLACK,
  })
}

function newContinuationPage(pdf: PDFDocument): {
  page: PDFPage
  y: number
} {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  return { page, y: cv(CONTINUATION_START_Y) }
}

function ensureSpace(ctx: PdfCtx, needed: number): PdfCtx {
  if (ctx.y - needed >= 50) return ctx

  const { page, y } = newContinuationPage(ctx.pdf)
  return { ...ctx, page, y }
}

type FieldRow = { label: string; value: string; longLabel?: boolean }

type SectionItem = {
  itemLabel?: string
  fields: FieldRow[]
}

const LONG_LABEL_SIZE = 9
const LONG_LABEL_LINE_HEIGHT = 11.5

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
    const candidate = current ? `${current} ${word}` : word

    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) lines.push(current)

  return lines
}

function estimateFieldRowHeight(
  fonts: Fonts,
  field: FieldRow,
  maxWidth: number
): number {
  if (field.longLabel) {
    const lines = wrapText(
      fonts.regular,
      field.label,
      LONG_LABEL_SIZE,
      maxWidth
    )
    const answerHeight = field.value ? FIELD_VALUE_SIZE + 8 : 0
    return lines.length * LONG_LABEL_LINE_HEIGHT + answerHeight + 6
  }

  return field.value ? FIELD_ROW_HEIGHT : FIELD_ROW_HEIGHT - 10
}

function estimateItemHeight(
  fonts: Fonts,
  item: SectionItem,
  showItemLabel: boolean,
  maxWidth: number
): number {
  const labelHeight = showItemLabel && item.itemLabel ? ITEM_LABEL_HEIGHT : 0
  const fieldsHeight = item.fields.reduce(
    (sum, f) => sum + estimateFieldRowHeight(fonts, f, maxWidth),
    0
  )
  return labelHeight + fieldsHeight
}

function estimateSectionHeight(
  fonts: Fonts,
  items: SectionItem[],
  maxWidth: number
): number {
  const showItemLabels = items.length > 1
  const itemsHeight = items.reduce(
    (sum, item) =>
      sum + estimateItemHeight(fonts, item, showItemLabels, maxWidth),
    0
  )
  const dividersHeight =
    items.length > 1 ? (items.length - 1) * ITEM_DIVIDER_GAP : 0

  return (
    SECTION_HEADER_HEIGHT +
    itemsHeight +
    dividersHeight +
    SECTION_TOP_PAD +
    SECTION_BOTTOM_PAD
  )
}

function drawFieldRow(
  page: PDFPage,
  fonts: Fonts,
  field: FieldRow,
  x: number,
  y: number,
  maxWidth: number
): number {
  if (field.longLabel) {
    const lines = wrapText(
      fonts.regular,
      field.label,
      LONG_LABEL_SIZE,
      maxWidth
    )
    let cursorY = y

    for (const line of lines) {
      page.drawText(line, {
        x,
        y: cursorY,
        size: LONG_LABEL_SIZE,
        font: fonts.regular,
        color: LABEL_GRAY,
      })
      cursorY -= LONG_LABEL_LINE_HEIGHT
    }

    if (field.value) {
      page.drawText(`Odpověď: ${field.value}`, {
        x,
        y: cursorY - 2,
        size: FIELD_VALUE_SIZE,
        font: fonts.bold,
        color: TEXT_BLACK,
      })
      cursorY -= FIELD_VALUE_SIZE + 8
    }

    return cursorY - 6
  }

  page.drawText(field.label.toLocaleUpperCase("cs-CZ"), {
    x,
    y,
    size: FIELD_LABEL_SIZE,
    font: fonts.bold,
    color: LABEL_GRAY,
  })

  if (field.value) {
    drawTextFitted(
      page,
      fonts.bold,
      field.value,
      x,
      y - 13,
      maxWidth,
      FIELD_VALUE_SIZE
    )
    return y - FIELD_ROW_HEIGHT
  }

  return y - (FIELD_ROW_HEIGHT - 10)
}

function drawNumberedSection(
  ctx: PdfCtx,
  sectionTitle: string,
  items: SectionItem[]
): PdfCtx {
  if (items.length === 0) return ctx

  const fieldMaxWidth = CONTENT_WIDTH - SECTION_PADDING * 2
  const neededHeight = estimateSectionHeight(ctx.fonts, items, fieldMaxWidth)
  const next = ensureSpace(ctx, neededHeight)
  const sectionIndex = next.sectionIndex + 1
  const letter = letterFor(sectionIndex)

  const boxTop = next.y
  let y = next.y - SECTION_TOP_PAD

  const headingText = `${letter}. ${sectionTitle}`

  next.page.drawText(headingText, {
    x: CONTENT_LEFT + SECTION_PADDING,
    y,
    size: 11.5,
    font: next.fonts.bold,
    color: TEXT_BLACK,
  })

  y -= SECTION_HEADER_HEIGHT

  const showItemLabels = items.length > 1

  items.forEach((item, itemIndex) => {
    if (itemIndex > 0) {
      next.page.drawLine({
        start: { x: CONTENT_LEFT + SECTION_PADDING, y: y + 6 },
        end: { x: CONTENT_RIGHT - SECTION_PADDING, y: y + 6 },
        thickness: 0.5,
        color: BORDER_GRAY,
      })
      y -= ITEM_DIVIDER_GAP
    }

    if (showItemLabels && item.itemLabel) {
      next.page.drawText(item.itemLabel, {
        x: CONTENT_LEFT + SECTION_PADDING,
        y,
        size: 9.5,
        font: next.fonts.bold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= ITEM_LABEL_HEIGHT
    }

    item.fields.forEach((field) => {
      y = drawFieldRow(
        next.page,
        next.fonts,
        field,
        CONTENT_LEFT + SECTION_PADDING,
        y,
        CONTENT_WIDTH - SECTION_PADDING * 2
      )
    })
  })

  const boxBottom = y - SECTION_BOTTOM_PAD

  next.page.drawRectangle({
    x: CONTENT_LEFT,
    y: boxBottom,
    width: CONTENT_WIDTH,
    height: boxTop - boxBottom,
    borderColor: BORDER_GRAY,
    borderWidth: 1,
  })

  return { ...next, sectionIndex, y: boxBottom - SECTION_GAP }
}

function drawSignatureBlock(
  ctx: PdfCtx,
  completedAt: Date | string | null | undefined
): PdfCtx {
  const maxWidth = CONTENT_WIDTH - SECTION_PADDING * 2
  const signedLine = `Elektronicky podepsáno: ${ctx.employeeDisplayName || "—"}, ${formatDateTime(completedAt) || "—"}`
  const confirmLine =
    "Odesláním tohoto formuláře v elektronické podobě zaměstnanec potvrzuje pravdivost, úplnost a souhlas s výše uvedenými údaji a prohlášeními."

  const confirmLines = wrapText(
    ctx.fonts.regular,
    confirmLine,
    LONG_LABEL_SIZE,
    maxWidth
  )

  const neededHeight =
    SECTION_TOP_PAD +
    SECTION_BOTTOM_PAD +
    FIELD_VALUE_SIZE +
    6 +
    confirmLines.length * LONG_LABEL_LINE_HEIGHT

  const next = ensureSpace(ctx, neededHeight)
  const boxTop = next.y
  let y = next.y - SECTION_TOP_PAD

  next.page.drawText(signedLine, {
    x: CONTENT_LEFT + SECTION_PADDING,
    y,
    size: FIELD_VALUE_SIZE,
    font: next.fonts.bold,
    color: TEXT_BLACK,
  })

  y -= FIELD_VALUE_SIZE + 6

  for (const line of confirmLines) {
    next.page.drawText(line, {
      x: CONTENT_LEFT + SECTION_PADDING,
      y,
      size: LONG_LABEL_SIZE,
      font: next.fonts.regular,
      color: LABEL_GRAY,
    })
    y -= LONG_LABEL_LINE_HEIGHT
  }

  const boxBottom = y - SECTION_BOTTOM_PAD + LONG_LABEL_LINE_HEIGHT

  next.page.drawRectangle({
    x: CONTENT_LEFT,
    y: boxBottom,
    width: CONTENT_WIDTH,
    height: boxTop - boxBottom,
    borderColor: BORDER_GRAY,
    borderWidth: 1,
  })

  return { ...next, y: boxBottom - SECTION_GAP }
}

function periodField(
  from?: string | null,
  to?: string | null,
  ongoing?: boolean | null
): FieldRow {
  const value = ongoing
    ? `${formatDate(from ?? "")} – stále trvá`
    : from || to
      ? `${formatDate(from ?? "")} – ${formatDate(to ?? "")}`
      : ""
  return { label: "Období", value }
}

function yesNo(v: boolean | undefined | null) {
  return v === true ? "Ano" : v === false ? "Ne" : ""
}

function fillHeaderTable(
  page: PDFPage,
  fonts: Fonts,
  values: {
    name: string
    personalNumber: string
    position: string
    department: string
    unit: string
    startDate: string
    filledDate: string
  }
) {
  const rows: Array<[keyof typeof TABLE_ROW_Y, string, PDFFont]> = [
    ["name", values.name, fonts.bold],
    ["personalNumber", values.personalNumber, fonts.regular],
    ["position", values.position, fonts.regular],
    ["department", values.department, fonts.regular],
    ["unit", values.unit, fonts.regular],
    ["startDate", values.startDate, fonts.regular],
    ["filledDate", values.filledDate, fonts.regular],
  ]

  for (const [rowKey, value, font] of rows) {
    drawTextFitted(
      page,
      font,
      value,
      HEADER_VALUE_X,
      cv(TABLE_ROW_Y[rowKey] + HEADER_VALUE_Y_OFFSET),
      HEADER_VALUE_MAX_WIDTH,
      FIELD_VALUE_SIZE
    )
  }
}

async function loadTemplatePage1(pdfDoc: PDFDocument): Promise<PDFPage> {
  const templateBytes = await fs.readFile(TEMPLATE_PATH)
  const templateDoc = await PDFDocument.load(templateBytes)
  const [copiedPage] = await pdfDoc.copyPages(templateDoc, [0])
  pdfDoc.addPage(copiedPage)
  return copiedPage
}

function beginDocument(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  docInfo: DocumentInfo,
  extra?: { fullNameOverride?: string }
): PdfCtx {
  drawPageTitle(page, fonts, title)

  const name = extra?.fullNameOverride?.trim()
    ? extra.fullNameOverride
    : [docInfo.titleBefore, docInfo.employeeName, docInfo.titleAfter]
        .filter(Boolean)
        .join(" ")

  fillHeaderTable(page, fonts, {
    name: name || "—",
    personalNumber: docInfo.personalNumber ?? "",
    position: docInfo.positionName ?? "",
    department: docInfo.department ?? "",
    unit: docInfo.unitName ?? "",
    startDate: formatDate(docInfo.employmentStart),
    filledDate: formatDate(docInfo.completedAt),
  })

  return {
    pdf: page.doc,
    fonts,
    page,
    y: cv(SECTION_START_Y_PAGE1),
    sectionIndex: 0,
    employeeDisplayName: name || docInfo.employeeName,
  }
}

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  EMPLOYMENT: "Zaměstnanecký poměr",
  OSVC: "OSVČ",
  DPP: "Dohoda o provedení práce (DPP)",
  DPC: "Dohoda o pracovní činnosti (DPČ)",
  OTHER: "Jiné",
}

const MILITARY_SERVICE_LABELS: Record<string, string> = {
  BASIC: "základní",
  ALTERNATIVE: "náhradní",
  CIVIL: "civilní",
}

function generateAffidavitPDF(
  page: PDFPage,
  fonts: Fonts,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as AffidavitData
  let ctx = beginDocument(page, fonts, "Čestné prohlášení", docInfo)

  const experienceList = (data.experience ?? []).filter(
    (e) => e.employer || e.jobType || e.from || e.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Praxe",
    data.noExperience
      ? [
          {
            fields: [
              {
                label:
                  "Nemám žádnou praxi (jsem např. čerstvě po škole nebo jiné)",
                value: "Ano",
              },
            ],
          },
        ]
      : experienceList.map((exp, idx) => ({
          itemLabel: `${idx + 1}. Zaměstnání`,
          fields: [
            { label: "Zaměstnavatel", value: exp.employer ?? "" },
            { label: "Druh práce", value: exp.jobType ?? "" },
            {
              label: "Typ výkonu práce",
              value: exp.employmentType
                ? (EXPERIENCE_TYPE_LABELS[exp.employmentType] ??
                  exp.employmentType)
                : "",
            },
            periodField(exp.from, exp.to, exp.ongoing),
          ],
        }))
  )

  const militaryList = (data.militaryService ?? []).filter(
    (m) => m.service || m.from || m.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Vojenská, náhradní nebo civilní služba",
    militaryList.map((mil, idx) => ({
      itemLabel: `${idx + 1}. Služba`,
      fields: [
        {
          label: "Druh služby",
          value: mil.service
            ? (MILITARY_SERVICE_LABELS[mil.service] ?? mil.service)
            : "",
        },
        periodField(mil.from, mil.to, mil.ongoing),
      ],
    }))
  )

  const unpaidList = (data.unpaidLeave ?? []).filter(
    (u) => u.reason || u.from || u.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Pracovní volno bez náhrady platu/mzdy",
    unpaidList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Případ`,
      fields: [
        { label: "Důvod", value: item.reason ?? "" },
        periodField(item.from, item.to),
      ],
    }))
  )

  const maternityList = (data.maternityParental ?? []).filter(
    (m) => m.childName || m.childBirthDate || m.from || m.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Mateřská a rodičovská dovolená",
    maternityList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Záznam`,
      fields: [
        { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
        { label: "Datum narození", value: formatDate(item.childBirthDate) },
        periodField(item.from, item.to),
      ],
    }))
  )

  const continuousList = (data.continuousCare ?? []).filter(
    (c) => c.childName || c.childBirthDate || c.from || c.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Trvalá péče o dítě nebo děti",
    continuousList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Záznam`,
      fields: [
        { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
        { label: "Datum narození", value: formatDate(item.childBirthDate) },
        periodField(item.from, item.to),
      ],
    }))
  )

  const disabledList = (data.disabledChildCare ?? []).filter(
    (d) => d.childName || d.childBirthDate || d.from || d.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Péče o dlouhodobě zdravotně postižené dítě",
    disabledList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Záznam`,
      fields: [
        { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
        { label: "Datum narození", value: formatDate(item.childBirthDate) },
        periodField(item.from, item.to),
      ],
    }))
  )

  const closeRelativeList = (data.closeRelativeCare ?? []).filter(
    (c) => c.personName || c.dependencyLevel || c.from || c.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Péče o osobu blízkou",
    closeRelativeList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Záznam`,
      fields: [
        { label: "Jméno a příjmení osoby", value: item.personName ?? "" },
        {
          label: "Stupeň závislosti",
          value:
            item.dependencyLevel === "III"
              ? "III (těžká závislost)"
              : item.dependencyLevel === "IV"
                ? "IV (úplná závislost)"
                : (item.dependencyLevel ?? ""),
        },
        periodField(item.from, item.to),
      ],
    }))
  )

  const doctoralList = (data.doctoralStudy ?? []).filter(
    (d) => d.schoolName || d.studyProgram || d.from || d.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Doktorské studium",
    doctoralList.map((item, idx) => ({
      itemLabel: `${idx + 1}. Studium`,
      fields: [
        { label: "Název vysoké školy", value: item.schoolName ?? "" },
        { label: "Studijní program", value: item.studyProgram ?? "" },
        periodField(item.from, item.to),
      ],
    }))
  )

  ctx = drawNumberedSection(ctx, "Čestné prohlášení", [
    {
      fields: [
        {
          label:
            "Čestně prohlašuji, že mnou uvedené údaje jsou pravdivé. Jsem si plně vědom(a), že budou použity pro zápočet doby rozhodné pro zařazení do plat. stupně při zařazení do platové třídy, tzn. pro stanovení platového tarifu. Rovněž jsem si plně vědom(a), že nepravdivé údaje budou mít za následek mé bezdůvodné obohacení a zaměstnavatel bude žádat vrácení neprávem takto vyplacených finančních prostředků.",
          value: yesNo(data.isTruthful),
          longLabel: true,
        },
      ],
    },
  ])

  drawSignatureBlock(ctx, docInfo.completedAt)
}

const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Svobodný/á",
  MARRIED: "Vdaná / ženatý",
  DIVORCED: "Rozvedený/á",
  WIDOWED: "Vdova / vdovec",
  REGISTERED: "Registrované partnerství",
  UNSTATED: "Neuvádím",
}

function generatePayrollInfoPDF(
  page: PDFPage,
  fonts: Fonts,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as PayrollInfoData
  let ctx = beginDocument(
    page,
    fonts,
    "Dotazník pro vedení mzdové agendy",
    docInfo,
    { fullNameOverride: data.fullName ?? undefined }
  )

  const birthDateParts = [
    data.birthDay,
    data.birthMonth,
    data.birthYear,
  ].filter(Boolean)
  const birthDateDisplay =
    birthDateParts.length > 0
      ? `${data.birthDay ?? ""}. ${data.birthMonth ?? ""}. ${data.birthYear ?? ""}`.trim()
      : ""

  ctx = drawNumberedSection(ctx, "Osobní údaje", [
    {
      fields: [
        { label: "Rodné příjmení", value: data.maidenName ?? "" },
        { label: "Místo narození", value: data.birthPlace ?? "" },
        { label: "Rodné číslo", value: data.birthNumber ?? "" },
        { label: "Datum narození", value: birthDateDisplay },
        {
          label: "Rodinný stav",
          value: data.maritalStatus
            ? (MARITAL_STATUS_LABELS[data.maritalStatus] ?? data.maritalStatus)
            : "",
        },
      ],
    },
  ])

  const address = [
    data.permanentStreet,
    data.permanentHouseNumber,
    data.permanentCity,
    data.permanentPostcode,
  ]
    .filter(Boolean)
    .join(", ")

  ctx = drawNumberedSection(ctx, "Trvalé bydliště", [
    { fields: [{ label: "Adresa", value: address }] },
  ])

  const childrenList = (data.children ?? []).filter(
    (c) => c.childName || c.childBirthDate
  )
  ctx = drawNumberedSection(
    ctx,
    "Děti (pro účely daňového zvýhodnění)",
    childrenList.map((child, idx) => ({
      itemLabel: `${idx + 1}. Dítě`,
      fields: [
        { label: "Jméno dítěte", value: child.childName ?? "" },
        { label: "Datum narození", value: formatDate(child.childBirthDate) },
      ],
    }))
  )

  ctx = drawNumberedSection(ctx, "Zdravotní pojišťovna", [
    {
      fields: [
        {
          label: "Název zdravotní pojišťovny",
          value: data.healthInsuranceCompany ?? "",
        },
      ],
    },
  ])

  ctx = drawNumberedSection(ctx, "Bankovní účet pro zasílání platu", [
    {
      fields: [
        {
          label:
            "Žádám s účinností od dne nástupu zasílat na tento bankovní účet",
          value: "",
          longLabel: true,
        },
        { label: "Číslo účtu", value: data.bankAccountNumber ?? "" },
        { label: "Bankovní ústav", value: data.bankName ?? "" },
      ],
    },
  ])

  ctx = drawNumberedSection(ctx, "Prohlášení", [
    {
      fields: [
        {
          label:
            "Stvrzuji svým podpisem, že jsou výše uvedené údaje zcela pravdivé a případnou změnu jsem povinen včas osobně oznámit ve mzdové účtárně. Za způsobené škody nesu plnou odpovědnost.",
          value: yesNo(data.confirmTruthfulness),
          longLabel: true,
        },
        { label: "Datum", value: formatDate(data.signatureDate) },
      ],
    },
  ])

  drawSignatureBlock(ctx, docInfo.completedAt)
}

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  ZAKLADNI: "Základní",
  STREDNI_VYUCNI_LIST: "Střední vzdělání s výučním listem",
  STREDNI: "Střední",
  STREDNI_MATURITA: "Střední s maturitní zkouškou",
  VYSSI_ODBORNE: "Vyšší odborné",
  VYSOKOSKOLSKE: "Vysokoškolské",
  BAKALAR: "Bakalářský studijní program",
  MAGISTR: "Magisterský studijní program",
  DOKTORSKE: "Doktorský studijní program",
  PROBIHAJICI: "Probíhající studium",
  CELOZIVOTNI: "Celoživotní kariérní vzdělávání",
}

const STUDY_FORM_LABELS: Record<string, string> = {
  DENNI: "Denní",
  VECERNI: "Večerní",
  DALKOVE: "Dálkové",
  DISTANCNI: "Distanční",
  KOMBINOVANE: "Kombinované",
}

function generatePersonalQuestionnairePDF(
  page: PDFPage,
  fonts: Fonts,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as PersonalQuestionnaireData

  const pqNameParts = [
    data.titleBefore,
    data.firstName,
    data.lastName,
    data.titleAfter,
    data.academicDegrees,
  ].filter(Boolean)
  const pqDisplayName =
    pqNameParts.length > 0 ? pqNameParts.join(" ") : docInfo.employeeName

  let ctx = beginDocument(page, fonts, "Osobní dotazník", docInfo, {
    fullNameOverride: pqDisplayName,
  })

  ctx = drawNumberedSection(ctx, "Osobní údaje", [
    {
      fields: [
        { label: "Rodné příjmení", value: data.maidenName ?? "" },
        { label: "Všechna další příjmení", value: data.otherSurnames ?? "" },
        { label: "Datum narození", value: formatDate(data.birthDate) },
        { label: "Rodné číslo", value: data.birthNumber ?? "" },
        { label: "Místo narození", value: data.birthPlace ?? "" },
        { label: "Okres narození", value: data.birthDistrict ?? "" },
        { label: "Stát narození", value: data.birthState ?? "" },
        { label: "Telefon", value: data.phone ?? "" },
        { label: "Státní občanství", value: data.citizenship ?? "" },
      ],
    },
  ])

  const yesNoLocal = (v: boolean | undefined) => yesNo(v)

  ctx = drawNumberedSection(ctx, "Datová schránka", [
    {
      fields: [
        {
          label: "Žádám o doručování datovou schránkou",
          value: yesNoLocal(data.dataBoxDelivery),
          longLabel: true,
        },
        ...(data.dataBoxDelivery
          ? [
              {
                label:
                  "Prohlašuji, že se jedná o moji datovou schránku fyzické osoby a datová schránka není pro doručování znepřístupněna.",
                value: "Ano",
                longLabel: true,
              },
              { label: "ID datové schránky", value: data.dataBoxId ?? "" },
            ]
          : []),
      ],
    },
  ])

  ctx = drawNumberedSection(ctx, "Rodinný stav", [
    {
      fields: [
        {
          label: "Rodinný stav",
          value: data.maritalStatus
            ? (MARITAL_STATUS_LABELS[data.maritalStatus] ?? data.maritalStatus)
            : "",
        },
      ],
    },
  ])

  const hasForeignPermit =
    data.foreignPermitFrom ||
    data.foreignPermitTo ||
    data.foreignPermitAuthority

  if (hasForeignPermit) {
    ctx = drawNumberedSection(
      ctx,
      "Povolení k pobytu (cizí státní příslušníci)",
      [
        {
          fields: [
            { label: "Vydáno od", value: formatDate(data.foreignPermitFrom) },
            { label: "Vydáno do", value: formatDate(data.foreignPermitTo) },
            { label: "Vydal", value: data.foreignPermitAuthority ?? "" },
          ],
        },
      ]
    )
  }

  const permanentAddress = [
    data.permanentStreet,
    data.permanentHouseNumber,
    data.permanentCity,
    data.permanentPostcode,
  ]
    .filter(Boolean)
    .join(", ")

  ctx = drawNumberedSection(ctx, "Adresa trvalého pobytu", [
    { fields: [{ label: "Adresa", value: permanentAddress }] },
  ])

  const correspondenceAddress = [
    data.correspondenceStreet,
    data.correspondenceHouseNumber,
    data.correspondenceCity,
    data.correspondencePostcode,
  ]
    .filter(Boolean)
    .join(", ")

  if (correspondenceAddress) {
    ctx = drawNumberedSection(ctx, "Adresa pro doručování", [
      { fields: [{ label: "Adresa", value: correspondenceAddress }] },
    ])
  }

  ctx = drawNumberedSection(ctx, "Zdravotní pojišťovna a bankovní účet", [
    {
      fields: [
        {
          label: "Zdravotní pojišťovna",
          value: data.healthInsuranceCompany ?? "",
        },
        { label: "Číslo bankovního účtu", value: data.bankAccountNumber ?? "" },
        { label: "Bankovní instituce", value: data.bankName ?? "" },
      ],
    },
  ])

  const disabilityFields: FieldRow[] = [
    {
      label: "Pobírá dávky důchodového pojištění",
      value: yesNoLocal(data.receivesPensionBenefits),
    },
    ...(data.receivesPensionBenefits
      ? [{ label: "Druh důchodu", value: data.typePensionBenefits ?? "" }]
      : []),
    {
      label: "Osoba se zdravotním postižením",
      value: yesNoLocal(data.isDisabledPerson),
    },
    ...(data.isDisabledPerson && data.disabilityDegree !== "NONE"
      ? [{ label: "Stupeň postižení", value: data.disabilityDegree ?? "" }]
      : []),
  ]

  ctx = drawNumberedSection(ctx, "Doplňující údaje", [
    {
      fields: [
        {
          label: "Kontaktní osoba pro mimořádné situace",
          value: data.maintenanceInfo ?? "",
        },
        ...disabilityFields,
      ],
    },
  ])

  const educationList = (data.education ?? []).filter(
    (e) =>
      e.level ||
      e.schoolType ||
      e.semesters ||
      e.studyForm ||
      e.graduationYear ||
      e.examType
  )
  ctx = drawNumberedSection(
    ctx,
    "Vzdělání",
    educationList.map((edu, idx) => ({
      itemLabel: `${idx + 1}. Vzdělání`,
      fields: [
        {
          label: "Stupeň",
          value: edu.level
            ? (EDUCATION_LEVEL_LABELS[edu.level] ?? edu.level)
            : "",
        },
        { label: "Druh školy / obor", value: edu.schoolType ?? "" },
        {
          label: "Forma studia",
          value: edu.studyForm
            ? (STUDY_FORM_LABELS[edu.studyForm] ?? edu.studyForm)
            : "",
        },
        { label: "Počet tříd (semestrů)", value: edu.semesters ?? "" },
        { label: "Rok ukončení", value: edu.graduationYear ?? "" },
        { label: "Druh zkoušky", value: edu.examType ?? "" },
      ],
    }))
  )

  const languages = (data.languages ?? []).filter((l) => l.name && l.level)
  if (languages.length > 0) {
    ctx = drawNumberedSection(ctx, "Znalost cizích jazyků", [
      {
        fields: languages.map((lang) => ({
          label: lang.name ?? "Jazyk",
          value: lang.level ?? "",
        })),
      },
    ])
  }

  const certificateFields: FieldRow[] = [
    {
      label: "Osvědčení o vzdělávání vedoucích úředníků",
      value: yesNoLocal(data.hasCertificateManagement),
    },
    {
      label: "Osvědčení o zvláštní odborné způsobilosti",
      value: yesNoLocal(data.hasCertificateSpecial),
    },
    ...(data.hasCertificateSpecial
      ? [{ label: "Jaké osvědčení", value: data.certificateSpecialName ?? "" }]
      : []),
    {
      label: "Osvědčení o vstupním školení",
      value: yesNoLocal(data.hasCertificateTraining),
    },
    {
      label: "Osvědčení o vykonání úřednické zkoušky",
      value: yesNoLocal(data.hasCertificateGeneral),
    },
  ]

  ctx = drawNumberedSection(ctx, "Osvědčení", [{ fields: certificateFields }])

  ctx = drawNumberedSection(ctx, "Závěrečné údaje", [
    {
      fields: [
        { label: "Příbuzní na ÚMČ Praha 6", value: data.familyRelations ?? "" },
        {
          label:
            "Žádám ve smyslu ust. § 143 ZP, aby mé vyúčtování platu bylo převáděno na platební účet, který jsem uvedl/a v tomto dotazníku.",
          value: yesNoLocal(data.finalRequestPayrollTransfer),
          longLabel: true,
        },
        {
          label:
            "Prohlašuji, že jsem nic nezamlčel(a) a všechny mnou uvedené údaje jsou pravdivé.",
          value: yesNoLocal(data.finalReadAndUnderstood),
          longLabel: true,
        },
        {
          label:
            "Prohlašuji, že změnu jakéhokoli z mnou uvedených údajů oznámím bezodkladně na personálním oddělení a na mzdové účtárně. Pokud by nesplnění této povinnosti způsobilo škodu, nesu za ni plnou odpovědnost.",
          value: yesNoLocal(data.finalTruthfulnessConfirm),
          longLabel: true,
        },
      ],
    },
  ])

  drawSignatureBlock(ctx, docInfo.completedAt)
}

export async function buildEmploymentDocumentPdf(id: number): Promise<{
  buffer: Buffer
  employeeName: string
  docType: string
} | null> {
  const doc = await prisma.employmentDocument.findUnique({
    where: { id },
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
          titleBefore: true,
          titleAfter: true,
          personalNumber: true,
          positionName: true,
          department: true,
          unitName: true,
          plannedStart: true,
          actualStart: true,
        },
      },
    },
  })

  if (!doc) return null

  const pdfDoc = await PDFDocument.create()
  const fonts = await loadPdfFonts(pdfDoc)

  const employeeName = [doc.onboarding?.name, doc.onboarding?.surname]
    .filter(Boolean)
    .join(" ")

  const docInfo: DocumentInfo = {
    id: doc.id,
    status: doc.status,
    completedAt: doc.completedAt,
    employeeName,
    titleBefore: doc.onboarding?.titleBefore ?? null,
    titleAfter: doc.onboarding?.titleAfter ?? null,
    personalNumber: doc.onboarding?.personalNumber ?? null,
    positionName: doc.onboarding?.positionName ?? null,
    department: doc.onboarding?.department ?? null,
    unitName: doc.onboarding?.unitName ?? null,
    employmentStart:
      doc.onboarding?.actualStart ?? doc.onboarding?.plannedStart ?? null,
  }

  const page1 = await loadTemplatePage1(pdfDoc)

  switch (doc.type) {
    case "AFFIDAVIT":
      generateAffidavitPDF(page1, fonts, doc.data, docInfo)
      break
    case "PERSONAL_QUESTIONNAIRE":
      generatePersonalQuestionnairePDF(page1, fonts, doc.data, docInfo)
      break
    case "PAYROLL_INFO":
      generatePayrollInfoPDF(page1, fonts, doc.data, docInfo)
      break
    default:
      throw new Error("Neznámý typ dokumentu")
  }

  const bytes = await pdfDoc.save()

  return {
    buffer: Buffer.from(toArrayBuffer(bytes)),
    employeeName,
    docType: doc.type,
  }
}
