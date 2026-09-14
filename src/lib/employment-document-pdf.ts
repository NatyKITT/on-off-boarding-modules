import fs from "fs/promises"
import path from "path"

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { BANK_OPTIONS, OTHER_BANK_VALUE } from "@/types/bank-options"
import {
  HEALTH_INSURANCE_OPTIONS,
  OTHER_HEALTH_INSURANCE_VALUE,
} from "@/types/health-insurance-options"
import {
  CZECH_CITIZENSHIP_VALUE,
  NATIONALITY_OPTIONS,
  OTHER_CITIZENSHIP_VALUE,
} from "@/types/nationality-options"

import { prisma } from "@/lib/db"
import { loadPdfFonts } from "@/lib/pdf-fonts"
import { DRIVER_LICENSE_CATEGORY_LABELS } from "@/lib/validations/employment-documents"

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
const FIELD_VALUE_SIZE = 10
const FIELD_ROW_HEIGHT = 18
const LABEL_VALUE_GAP = 6
const ITEM_LABEL_HEIGHT = 16
const ITEM_DIVIDER_GAP = 10
const SECTION_HEADER_HEIGHT = 30
const SECTION_HEADER_RULE_GAP = 14
const SECTION_GAP = 14
const SECTION_PADDING = 12
const SECTION_TOP_PAD = 16
const SECTION_BOTTOM_PAD = 12
const COLUMN_GAP = 20

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
  jobPositionName?: string | null
  jobType?: string | null
  employmentType?: string | null
  from?: string | null
  to?: string | null
  workloadType?: "FULL" | "HALF" | "OTHER" | string | null
  workloadOther?: string | null
}

type AffidavitData = {
  experience?: ExperienceItem[]
  noExperience?: boolean
  hasMilitaryService?: boolean
  militaryService?: MilitaryServiceItem[]
  hasMaternityParental?: boolean
  maternityParental?: ChildCareItem[]
  hasContinuousCare?: boolean
  continuousCare?: ChildCareItem[]
  hasDisabledChildCare?: boolean
  disabledChildCare?: ChildCareItem[]
  hasCloseRelativeCare?: boolean
  closeRelativeCare?: CloseRelativeCareItem[]
  hasDoctoralStudy?: boolean
  doctoralStudy?: DoctoralStudyItem[]
  hasUnpaidLeave?: boolean
  unpaidLeave?: UnpaidLeaveItem[]
  isTruthful?: boolean
  [key: string]: unknown
}

type PayrollChildItem = {
  childName?: string | null
  childBirthDate?: string | null
}

type PayrollInfoData = {
  firstName?: string | null
  lastName?: string | null
  birthSurnameDiffers?: boolean
  birthSurname?: string | null
  titleBefore?: string | null
  titleAfter?: string | null
  academicDegrees?: string | null
  maritalStatus?:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "REGISTERED"
    | "UNSTATED"
    | string
  birthDate?: string | null
  birthNumber?: string | null
  birthPlace?: string | null
  birthDistrict?: string | null
  birthState?: string | null
  citizenship?: string | null
  citizenshipOther?: string | null
  permanentStreet?: string | null
  permanentHouseNumber?: string | null
  permanentCity?: string | null
  permanentPostcode?: string | null
  hasChildren?: boolean
  children?: PayrollChildItem[]
  healthInsuranceCompany?: string | null
  healthInsuranceCompanyOther?: string | null
  bankAccountNumber?: string | null
  bankName?: string | null
  bankNameOther?: string | null
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
  degreeTitle?: string | null
  studyStatus?: "COMPLETED" | "ONGOING" | string
}

type CertificateSpecialEntry = {
  name?: string | null
}

type PersonalQuestionnaireData = {
  firstName?: string | null
  lastName?: string | null
  birthSurnameDiffers?: boolean
  birthSurname?: string | null
  titleBefore?: string | null
  titleAfter?: string | null
  academicDegrees?: string | null
  maritalStatus?:
    | "SINGLE"
    | "MARRIED"
    | "DIVORCED"
    | "WIDOWED"
    | "REGISTERED"
    | "UNSTATED"
    | string
  birthDate?: string | null
  birthNumber?: string | null
  birthPlace?: string | null
  birthDistrict?: string | null
  birthState?: string | null
  citizenship?: string | null
  citizenshipOther?: string | null
  foreignPermitFrom?: string | null
  foreignPermitTo?: string | null
  foreignPermitAuthority?: string | null
  email?: string | null
  phoneCountryCode?: string | null
  phone?: string | null
  dataBoxId?: string | null
  dataBoxDelivery?: boolean
  permanentStreet?: string | null
  permanentHouseNumber?: string | null
  permanentCity?: string | null
  permanentPostcode?: string | null
  useDifferentMailingAddress?: boolean
  correspondenceStreet?: string | null
  correspondenceHouseNumber?: string | null
  correspondenceCity?: string | null
  correspondencePostcode?: string | null
  hasDriverLicense?: boolean
  driverLicenseCategories?: string[]
  maintenanceInfo?: string | null
  receivesPensionBenefits?: boolean
  typePensionBenefits?: string | null
  isDisabledPerson?: boolean
  disabilityDegree?: "NONE" | "I" | "II" | "III" | string
  familyRelations?: string | null
  education?: EducationEntry[]
  languages?: LanguageEntry[]
  hasCertificateManagement?: boolean
  hasCertificateSpecial?: boolean
  certificateSpecialNames?: CertificateSpecialEntry[]
  hasCertificateTraining?: boolean
  hasCertificateGeneral?: boolean
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

type FieldRow = {
  label: string
  value: string
  longLabel?: boolean
  optional?: boolean
  emphasize?: boolean
  noAnswer?: boolean
}

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
    const labelFont = field.emphasize ? fonts.bold : fonts.regular
    const lines = wrapText(labelFont, field.label, LONG_LABEL_SIZE, maxWidth)
    const answerHeight = field.noAnswer ? 0 : FIELD_VALUE_SIZE + 8
    return lines.length * LONG_LABEL_LINE_HEIGHT + answerHeight + 6
  }

  return FIELD_ROW_HEIGHT
}

type FieldRowLayout =
  | { kind: "pair"; a: FieldRow; b: FieldRow }
  | { kind: "single"; field: FieldRow }

function layoutFieldRows(fields: FieldRow[]): FieldRowLayout[] {
  const rows: FieldRowLayout[] = []
  let pending: FieldRow | null = null

  for (const field of fields) {
    if (field.longLabel) {
      if (pending) {
        rows.push({ kind: "single", field: pending })
        pending = null
      }
      rows.push({ kind: "single", field })
      continue
    }

    if (pending) {
      rows.push({ kind: "pair", a: pending, b: field })
      pending = null
    } else {
      pending = field
    }
  }

  if (pending) {
    rows.push({ kind: "single", field: pending })
  }

  return rows
}

function estimateItemHeight(
  fonts: Fonts,
  item: SectionItem,
  showItemLabel: boolean,
  maxWidth: number
): number {
  const labelHeight = showItemLabel && item.itemLabel ? ITEM_LABEL_HEIGHT : 0
  const columnWidth = (maxWidth - COLUMN_GAP) / 2

  const rowsHeight = layoutFieldRows(item.fields).reduce((sum, row) => {
    if (row.kind === "single") {
      return sum + estimateFieldRowHeight(fonts, row.field, maxWidth)
    }
    const heightA = estimateFieldRowHeight(fonts, row.a, columnWidth)
    const heightB = estimateFieldRowHeight(fonts, row.b, columnWidth)
    return sum + Math.max(heightA, heightB)
  }, 0)

  return labelHeight + rowsHeight
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
    const labelFont = field.emphasize ? fonts.bold : fonts.regular
    const labelColor = field.emphasize ? TEXT_BLACK : LABEL_GRAY

    const lines = wrapText(labelFont, field.label, LONG_LABEL_SIZE, maxWidth)
    let cursorY = y

    for (const line of lines) {
      page.drawText(line, {
        x,
        y: cursorY,
        size: LONG_LABEL_SIZE,
        font: labelFont,
        color: labelColor,
      })
      cursorY -= LONG_LABEL_LINE_HEIGHT
    }

    if (!field.noAnswer) {
      page.drawText(`Odpověď: ${field.value || "Nevyplněno"}`, {
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

  const displayValue = field.value || "Nevyplněno"
  const labelText = field.label.toLocaleUpperCase("cs-CZ") + ":"

  page.drawText(labelText, {
    x,
    y,
    size: FIELD_LABEL_SIZE,
    font: fonts.bold,
    color: LABEL_GRAY,
  })

  const labelWidth = fonts.bold.widthOfTextAtSize(labelText, FIELD_LABEL_SIZE)
  const valueX = x + labelWidth + LABEL_VALUE_GAP
  const valueMaxWidth = Math.max(30, maxWidth - labelWidth - LABEL_VALUE_GAP)

  drawTextFitted(
    page,
    fonts.bold,
    displayValue,
    valueX,
    y - 0.5,
    valueMaxWidth,
    FIELD_VALUE_SIZE
  )
  return y - FIELD_ROW_HEIGHT
}

function drawNumberedSection(
  ctx: PdfCtx,
  sectionTitle: string,
  items: SectionItem[]
): PdfCtx {
  if (items.length === 0) return ctx

  const fieldMaxWidth = CONTENT_WIDTH - SECTION_PADDING * 2
  const showItemLabels = items.length > 1

  const firstItemHeight = estimateItemHeight(
    ctx.fonts,
    items[0],
    showItemLabels,
    fieldMaxWidth
  )
  const minFirstPageHeight =
    SECTION_HEADER_HEIGHT +
    firstItemHeight +
    SECTION_TOP_PAD +
    SECTION_BOTTOM_PAD

  const cursor = ensureSpace(ctx, minFirstPageHeight)
  const sectionIndex = cursor.sectionIndex + 1
  const letter = letterFor(sectionIndex)

  let page = cursor.page
  let boxTop = cursor.y
  let y = cursor.y - SECTION_TOP_PAD

  const drawHeading = (continued: boolean) => {
    const headingText = continued
      ? `${letter}. ${sectionTitle} (pokračování)`
      : `${letter}. ${sectionTitle}`

    page.drawText(headingText, {
      x: CONTENT_LEFT + SECTION_PADDING,
      y,
      size: 12,
      font: cursor.fonts.bold,
      color: TEXT_BLACK,
    })
    y -= SECTION_HEADER_RULE_GAP

    page.drawLine({
      start: { x: CONTENT_LEFT + SECTION_PADDING, y },
      end: { x: CONTENT_RIGHT - SECTION_PADDING, y },
      thickness: 0.75,
      color: BORDER_GRAY,
    })

    y -= SECTION_HEADER_HEIGHT - SECTION_HEADER_RULE_GAP
  }

  const closeBox = () => {
    const boxBottom = y - SECTION_BOTTOM_PAD
    page.drawRectangle({
      x: CONTENT_LEFT,
      y: boxBottom,
      width: CONTENT_WIDTH,
      height: boxTop - boxBottom,
      borderColor: BORDER_GRAY,
      borderWidth: 1,
    })
    return boxBottom
  }

  drawHeading(false)

  items.forEach((item, itemIndex) => {
    const itemHeight =
      estimateItemHeight(cursor.fonts, item, showItemLabels, fieldMaxWidth) +
      (itemIndex > 0 ? ITEM_DIVIDER_GAP : 0)

    if (y - itemHeight < 50) {
      closeBox()
      const continuation = newContinuationPage(cursor.pdf)
      page = continuation.page
      boxTop = continuation.y
      y = continuation.y - SECTION_TOP_PAD
      drawHeading(true)
    } else if (itemIndex > 0) {
      page.drawLine({
        start: { x: CONTENT_LEFT + SECTION_PADDING, y: y + 6 },
        end: { x: CONTENT_RIGHT - SECTION_PADDING, y: y + 6 },
        thickness: 0.5,
        color: BORDER_GRAY,
      })
      y -= ITEM_DIVIDER_GAP
    }

    if (showItemLabels && item.itemLabel) {
      page.drawText(item.itemLabel, {
        x: CONTENT_LEFT + SECTION_PADDING,
        y,
        size: 9.5,
        font: cursor.fonts.bold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= ITEM_LABEL_HEIGHT
    }

    const columnWidth = (fieldMaxWidth - COLUMN_GAP) / 2
    const leftX = CONTENT_LEFT + SECTION_PADDING
    const rightX = leftX + columnWidth + COLUMN_GAP

    layoutFieldRows(item.fields).forEach((row) => {
      if (row.kind === "single") {
        y = drawFieldRow(page, cursor.fonts, row.field, leftX, y, fieldMaxWidth)
        return
      }

      const yAfterA = drawFieldRow(
        page,
        cursor.fonts,
        row.a,
        leftX,
        y,
        columnWidth
      )
      const yAfterB = drawFieldRow(
        page,
        cursor.fonts,
        row.b,
        rightX,
        y,
        columnWidth
      )
      y = Math.min(yAfterA, yAfterB)
    })
  })

  const boxBottom = closeBox()

  return { ...cursor, page, sectionIndex, y: boxBottom - SECTION_GAP }
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

function periodField(from?: string | null, to?: string | null): FieldRow {
  const value =
    from || to ? `${formatDate(from ?? "")} – ${formatDate(to ?? "")}` : ""
  return { label: "Období", value }
}

const WORKLOAD_TYPE_LABELS: Record<string, string> = {
  FULL: "Plný úvazek",
  HALF: "Poloviční úvazek",
}

function workloadLabel(type?: string | null, other?: string | null): string {
  if (!type) return ""
  if (type === "OTHER") return other ?? ""
  return WORKLOAD_TYPE_LABELS[type] ?? type
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

function buildYesNoListSection<T>(
  hasFlag: boolean | undefined,
  list: T[],
  noQuestionLabel: string,
  buildItems: (list: T[]) => SectionItem[]
): SectionItem[] {
  const has = hasFlag ?? list.length > 0
  if (!has) {
    return [{ fields: [{ label: noQuestionLabel, value: "Ne" }] }]
  }
  return buildItems(list)
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
            {
              label: "Název pracovní pozice",
              value: exp.jobPositionName ?? "",
            },
            { label: "Druh práce", value: exp.jobType ?? "" },
            {
              label: "Typ výkonu práce",
              value: exp.employmentType
                ? (EXPERIENCE_TYPE_LABELS[exp.employmentType] ??
                  exp.employmentType)
                : "",
            },
            periodField(exp.from, exp.to),
            {
              label: "Rozsah pracovního úvazku",
              value: workloadLabel(exp.workloadType, exp.workloadOther),
            },
          ],
        }))
  )

  const maternityList = (data.maternityParental ?? []).filter(
    (m) => m.childName || m.childBirthDate || m.from || m.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Mateřská a rodičovská dovolená",
    buildYesNoListSection(
      data.hasMaternityParental,
      maternityList,
      "Mateřská nebo rodičovská dovolená",
      (list) =>
        list.map((item, idx) => ({
          itemLabel: `${idx + 1}. Záznam`,
          fields: [
            { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
            {
              label: "Datum narození",
              value: formatDate(item.childBirthDate),
            },
            periodField(item.from, item.to),
          ],
        }))
    )
  )

  const continuousList = (data.continuousCare ?? []).filter(
    (c) => c.childName || c.childBirthDate || c.from || c.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Trvalá péče o dítě nebo děti",
    buildYesNoListSection(
      data.hasContinuousCare,
      continuousList,
      "Trvalá péče o dítě nebo děti",
      (list) =>
        list.map((item, idx) => ({
          itemLabel: `${idx + 1}. Záznam`,
          fields: [
            { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
            {
              label: "Datum narození",
              value: formatDate(item.childBirthDate),
            },
            periodField(item.from, item.to),
          ],
        }))
    )
  )

  const disabledList = (data.disabledChildCare ?? []).filter(
    (d) => d.childName || d.childBirthDate || d.from || d.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Péče o dlouhodobě zdravotně postižené dítě",
    buildYesNoListSection(
      data.hasDisabledChildCare,
      disabledList,
      "Péče o dlouhodobě zdravotně postižené dítě",
      (list) =>
        list.map((item, idx) => ({
          itemLabel: `${idx + 1}. Záznam`,
          fields: [
            { label: "Jméno a příjmení dítěte", value: item.childName ?? "" },
            {
              label: "Datum narození",
              value: formatDate(item.childBirthDate),
            },
            periodField(item.from, item.to),
          ],
        }))
    )
  )

  const closeRelativeList = (data.closeRelativeCare ?? []).filter(
    (c) => c.personName || c.dependencyLevel || c.from || c.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Péče o osobu blízkou",
    buildYesNoListSection(
      data.hasCloseRelativeCare,
      closeRelativeList,
      "Péče o osobu blízkou",
      (list) =>
        list.map((item, idx) => ({
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
  )

  const unpaidList = (data.unpaidLeave ?? []).filter(
    (u) => u.reason || u.from || u.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Pracovní volno bez náhrady platu/mzdy",
    buildYesNoListSection(
      data.hasUnpaidLeave,
      unpaidList,
      "Pracovní volno bez náhrady platu/mzdy",
      (list) =>
        list.map((item, idx) => ({
          itemLabel: `${idx + 1}. Případ`,
          fields: [
            { label: "Důvod", value: item.reason ?? "" },
            periodField(item.from, item.to),
          ],
        }))
    )
  )

  const militaryList = (data.militaryService ?? []).filter(
    (m) => m.service || m.from || m.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Vojenská, náhradní nebo civilní služba",
    buildYesNoListSection(
      data.hasMilitaryService,
      militaryList,
      "Výkon vojenské, náhradní nebo civilní služby",
      (list) =>
        list.map((mil, idx) => ({
          itemLabel: `${idx + 1}. Služba`,
          fields: [
            {
              label: "Druh služby",
              value: mil.service
                ? (MILITARY_SERVICE_LABELS[mil.service] ?? mil.service)
                : "",
            },
            periodField(mil.from, mil.to),
          ],
        }))
    )
  )

  const doctoralList = (data.doctoralStudy ?? []).filter(
    (d) => d.schoolName || d.studyProgram || d.from || d.to
  )
  ctx = drawNumberedSection(
    ctx,
    "Doktorské studium",
    buildYesNoListSection(
      data.hasDoctoralStudy,
      doctoralList,
      "Doktorské studium",
      (list) =>
        list.map((item, idx) => ({
          itemLabel: `${idx + 1}. Studium`,
          fields: [
            { label: "Název vysoké školy", value: item.schoolName ?? "" },
            { label: "Studijní program", value: item.studyProgram ?? "" },
            periodField(item.from, item.to),
          ],
        }))
    )
  )

  ctx = drawNumberedSection(ctx, "Čestné prohlášení", [
    {
      fields: [
        {
          label:
            "Čestně prohlašuji, že mnou uvedené údaje jsou pravdivé. Jsem si plně vědom(a), že budou použity pro zápočet doby rozhodné pro zařazení do plat. stupně při zařazení do platové třídy, tzn. pro stanovení platového tarifu. Rovněž jsem si plně vědom(a), že nepravdivé údaje budou mít za následek mé bezdůvodné obohacení a zaměstnavatel bude žádat vrácení neprávem takto vyplacených finančních prostředků.",
          value: yesNo(data.isTruthful),
          longLabel: true,
          emphasize: true,
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

  const nameParts = [
    data.titleBefore,
    data.firstName,
    data.lastName,
    data.titleAfter,
    data.academicDegrees,
  ].filter(Boolean)
  const fallbackDisplayName = [
    docInfo.titleBefore,
    docInfo.employeeName,
    docInfo.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
  const displayName = data.lastName ? nameParts.join(" ") : fallbackDisplayName

  let ctx = beginDocument(
    page,
    fonts,
    "Dotazník pro vedení mzdové agendy",
    docInfo,
    { fullNameOverride: displayName }
  )

  const citizenshipLabel =
    data.citizenship === OTHER_CITIZENSHIP_VALUE
      ? (data.citizenshipOther ?? "")
      : (NATIONALITY_OPTIONS.find((n) => n.value === data.citizenship)?.label ??
        data.citizenship ??
        "")

  ctx = drawNumberedSection(ctx, "Základní údaje zaměstnance", [
    {
      fields: [
        ...(data.birthSurnameDiffers
          ? [{ label: "Rodné příjmení", value: data.birthSurname ?? "" }]
          : []),
        {
          label: "Rodinný stav",
          value: data.maritalStatus
            ? (MARITAL_STATUS_LABELS[data.maritalStatus] ?? data.maritalStatus)
            : "",
        },
        { label: "Datum narození", value: formatDate(data.birthDate) },
        { label: "Rodné číslo", value: data.birthNumber ?? "" },
        { label: "Místo narození", value: data.birthPlace ?? "" },
        { label: "Okres narození", value: data.birthDistrict ?? "" },
        { label: "Stát narození", value: data.birthState ?? "" },
        { label: "Státní občanství", value: citizenshipLabel },
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

  ctx = drawNumberedSection(ctx, "Adresa trvalého pobytu", [
    { fields: [{ label: "Adresa", value: address }] },
  ])

  const childrenList = (data.children ?? []).filter(
    (c) => c.childName || c.childBirthDate
  )
  ctx = drawNumberedSection(
    ctx,
    "Děti (pro účely daňového zvýhodnění)",
    data.hasChildren && childrenList.length > 0
      ? childrenList.map((child, idx) => ({
          itemLabel: `${idx + 1}. Dítě`,
          fields: [
            { label: "Jméno dítěte", value: child.childName ?? "" },
            {
              label: "Datum narození",
              value: formatDate(child.childBirthDate),
            },
          ],
        }))
      : [
          {
            fields: [
              {
                label: "Má jedno nebo více dětí s daňovým zvýhodněním",
                value: "Ne",
              },
            ],
          },
        ]
  )

  const healthInsuranceLabel =
    data.healthInsuranceCompany === OTHER_HEALTH_INSURANCE_VALUE
      ? (data.healthInsuranceCompanyOther ?? "")
      : (HEALTH_INSURANCE_OPTIONS.find(
          (o) => o.value === data.healthInsuranceCompany
        )?.label ??
        data.healthInsuranceCompany ??
        "")

  ctx = drawNumberedSection(ctx, "Zdravotní pojišťovna", [
    {
      fields: [
        { label: "Název zdravotní pojišťovny", value: healthInsuranceLabel },
      ],
    },
  ])

  const bankLabel =
    data.bankName === OTHER_BANK_VALUE
      ? (data.bankNameOther ?? "")
      : (BANK_OPTIONS.find((o) => o.value === data.bankName)?.label ??
        data.bankName ??
        "")

  ctx = drawNumberedSection(ctx, "Zasílání platu/odměny na bankovní účet", [
    {
      fields: [
        {
          label:
            "Žádám s účinností od dne nástupu zasílat na tento bankovní účet",
          value: "",
          longLabel: true,
          noAnswer: true,
        },
        { label: "Číslo účtu", value: data.bankAccountNumber ?? "" },
        { label: "Bankovní ústav", value: bankLabel },
      ],
    },
  ])

  ctx = drawNumberedSection(ctx, "Prohlášení", [
    {
      fields: [
        {
          label:
            "Stvrzuji svým podpisem, že jsou výše uvedené údaje zcela pravdivé a případnou změnu jsem povinen včas osobně oznámit na oddělení platové a mzdové účtárny. Za způsobené škody nesu plnou odpovědnost.",
          value: yesNo(data.confirmTruthfulness),
          longLabel: true,
          emphasize: true,
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
  const pqFallbackDisplayName = [
    docInfo.titleBefore,
    docInfo.employeeName,
    docInfo.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
  const pqDisplayName = data.lastName
    ? pqNameParts.join(" ")
    : pqFallbackDisplayName

  let ctx = beginDocument(page, fonts, "Osobní dotazník", docInfo, {
    fullNameOverride: pqDisplayName,
  })

  const yesNoLocal = (v: boolean | undefined) => yesNo(v)

  const isForeignCitizenship = Boolean(
    data.citizenship && data.citizenship !== CZECH_CITIZENSHIP_VALUE
  )
  const citizenshipLabel =
    data.citizenship === OTHER_CITIZENSHIP_VALUE
      ? (data.citizenshipOther ?? "")
      : (NATIONALITY_OPTIONS.find((n) => n.value === data.citizenship)?.label ??
        data.citizenship ??
        "")

  ctx = drawNumberedSection(ctx, "Základní údaje", [
    {
      fields: [
        ...(data.birthSurnameDiffers
          ? [{ label: "Rodné příjmení", value: data.birthSurname ?? "" }]
          : []),
        {
          label: "Rodinný stav",
          value: data.maritalStatus
            ? (MARITAL_STATUS_LABELS[data.maritalStatus] ?? data.maritalStatus)
            : "",
        },
        { label: "Datum narození", value: formatDate(data.birthDate) },
        { label: "Rodné číslo", value: data.birthNumber ?? "" },
        { label: "Místo narození", value: data.birthPlace ?? "" },
        { label: "Okres narození", value: data.birthDistrict ?? "" },
        { label: "Stát narození", value: data.birthState ?? "" },
        { label: "Státní občanství", value: citizenshipLabel },
      ],
    },
    ...(isForeignCitizenship
      ? [
          {
            itemLabel: "Povolení k pobytu (cizí státní příslušníci)",
            fields: [
              {
                label: "Vydáno dne",
                value: formatDate(data.foreignPermitFrom),
              },
              {
                label: "Vydáno kým",
                value: data.foreignPermitAuthority ?? "",
              },
              { label: "Vydáno do", value: formatDate(data.foreignPermitTo) },
            ],
          },
        ]
      : []),
  ])

  const permanentAddress = [
    data.permanentStreet,
    data.permanentHouseNumber,
    data.permanentCity,
    data.permanentPostcode,
  ]
    .filter(Boolean)
    .join(", ")

  const correspondenceAddress = [
    data.correspondenceStreet,
    data.correspondenceHouseNumber,
    data.correspondenceCity,
    data.correspondencePostcode,
  ]
    .filter(Boolean)
    .join(", ")

  ctx = drawNumberedSection(ctx, "Kontaktní údaje", [
    {
      itemLabel: "Datová schránka",
      fields: [
        {
          label: "Žádám o doručování datovou schránkou",
          value: yesNoLocal(data.dataBoxDelivery),
          longLabel: true,
        },
        ...(data.dataBoxDelivery
          ? [{ label: "ID datové schránky", value: data.dataBoxId ?? "" }]
          : []),
      ],
    },
    {
      itemLabel: "Adresa trvalého pobytu",
      fields: [{ label: "Adresa", value: permanentAddress }],
    },
    {
      itemLabel: "Doručovací adresa",
      fields: [
        {
          label: "Adresa",
          value: data.useDifferentMailingAddress
            ? correspondenceAddress
            : "Shodná s adresou trvalého pobytu",
        },
      ],
    },
    {
      itemLabel: "E-mail a telefon",
      fields: [
        { label: "E-mail", value: data.email ?? "" },
        {
          label: "Telefon",
          value: data.phone
            ? `${data.phoneCountryCode ?? ""} ${data.phone}`.trim()
            : "",
        },
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
  const languages = (data.languages ?? []).filter((l) => l.name && l.level)

  const educationAndLanguageItems: SectionItem[] = [
    ...educationList.map((edu, idx) => ({
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
        {
          label: "Dosažený titul",
          value: edu.degreeTitle ?? "",
        },
        {
          label: "Stav",
          value: edu.studyStatus === "ONGOING" ? "Probíhající" : "Ukončeno",
        },
      ],
    })),
    ...(languages.length > 0
      ? [
          {
            itemLabel: "Znalost cizích jazyků",
            fields: languages.map((lang) => ({
              label: lang.name ?? "Jazyk",
              value: lang.level ?? "",
            })),
          },
        ]
      : []),
  ]

  ctx = drawNumberedSection(
    ctx,
    "Vzdělání a znalosti",
    educationAndLanguageItems.length > 0
      ? educationAndLanguageItems
      : [{ fields: [{ label: "Vzdělání", value: "" }] }]
  )

  const certificateSpecialList = (data.certificateSpecialNames ?? []).filter(
    (c) => !!c.name
  )

  const certificateFields: FieldRow[] = [
    {
      label:
        "Získal/a jste osvědčení o vzdělávání vedoucích úředníků dle zák. č. 312/2002 Sb.?",
      value: yesNoLocal(data.hasCertificateManagement),
      longLabel: true,
    },
    {
      label:
        "Získal/a jste osvědčení o zvláštní odborné způsobilosti dle zák. č. 312/2002 Sb.?",
      value: yesNoLocal(data.hasCertificateSpecial),
      longLabel: true,
    },
    ...(data.hasCertificateSpecial
      ? certificateSpecialList.map((c, idx) => ({
          label: `Typ osvědčení ${idx + 1}`,
          value: c.name ?? "",
        }))
      : []),
    {
      label:
        "Získal/a jste osvědčení o vstupním školení dle zák. č. 312/2002 Sb.?",
      value: yesNoLocal(data.hasCertificateTraining),
      longLabel: true,
    },
    {
      label:
        "Získal/a jste osvědčení o vykonání úřednické zkoušky dle zák. č. 234/2014 Sb.?",
      value: yesNoLocal(data.hasCertificateGeneral),
      longLabel: true,
    },
  ]

  ctx = drawNumberedSection(ctx, "Osvědčení", [{ fields: certificateFields }])

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

  ctx = drawNumberedSection(ctx, "Doplňující informace", [
    {
      itemLabel: "Řidičské oprávnění",
      fields: [
        {
          label: "Jsem vlastníkem řidičského oprávnění",
          value: yesNoLocal(data.hasDriverLicense),
        },
        ...(data.hasDriverLicense
          ? [
              {
                label: "Skupiny",
                value: (data.driverLicenseCategories ?? [])
                  .map((cat) => {
                    const label = (
                      DRIVER_LICENSE_CATEGORY_LABELS as Record<string, string>
                    )[cat]
                    return label ? `${cat} (${label})` : cat
                  })
                  .join(", "),
              },
            ]
          : []),
      ],
    },
    {
      itemLabel: "Kontaktní osoba",
      fields: [
        {
          label: "Kontaktní osoba pro mimořádné situace",
          value: data.maintenanceInfo ?? "",
        },
      ],
    },
    {
      itemLabel: "Důchod a zdravotní znevýhodnění",
      fields: disabilityFields,
    },
    {
      itemLabel: "Příbuzní zaměstnaní na ÚMČ Praha 6",
      fields: [{ label: "Příbuzní", value: data.familyRelations ?? "" }],
    },
  ])

  ctx = drawNumberedSection(ctx, "Prohlášení", [
    {
      fields: [
        {
          label:
            "Prohlašuji, že jsem nic nezamlčel(a) a všechny mnou uvedené údaje jsou pravdivé.",
          value: yesNoLocal(data.finalReadAndUnderstood),
          longLabel: true,
          emphasize: true,
        },
        {
          label:
            "Prohlašuji, že změnu jakéhokoli z mnou uvedených údajů oznámím bezodkladně na oddělení platové a mzdové účtárny. Pokud by nesplnění této povinnosti způsobilo škodu, nesu za ni plnou odpovědnost.",
          value: yesNoLocal(data.finalTruthfulnessConfirm),
          longLabel: true,
          emphasize: true,
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
