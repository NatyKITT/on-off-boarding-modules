import { readFile } from "fs/promises"
import path from "path"

import { NextRequest } from "next/server"
import { auth } from "@/auth"
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

type ChildCareItem = {
  childName?: string | null
  childBirthDate?: string | null
  from?: string | null
  to?: string | null
}

type UnpaidLeaveItem = {
  reason?: string | null
  from?: string | null
  to?: string | null
}

type AffidavitData = {
  militaryService?: "NONE" | "BASIC" | "ALTERNATIVE" | "CIVIL" | string
  maternityParental?: ChildCareItem[]
  continuousCare?: ChildCareItem[]
  disabledChildCare?: ChildCareItem[]
  unpaidLeave?: UnpaidLeaveItem[]
  isTruthful?: boolean
  [key: string]: unknown
}

type ChildEntry = {
  fullName?: string | null
  birthDate?: string | null
}

type LanguageEntry = {
  name?: string | null
  level?: string | null
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

  children?: ChildEntry[]
  languages?: LanguageEntry[]

  dataBoxDelivery?: boolean
  hasCertificateManagement?: boolean
  hasCertificateSpecial?: boolean
  hasCertificateTraining?: boolean
  hasCertificateGeneral?: boolean

  familyRelations?: string | null
  finalRequestPayrollTransfer?: boolean
  finalReadAndUnderstood?: boolean
  finalTruthfulnessConfirm?: boolean

  [key: string]: unknown
}

type EducationEntry = {
  level?: string | null
  schoolType?: string | null
  semesters?: string | null
  studyForm?: string | null
  graduationYear?: string | null
  examType?: string | null
}

type EducationData = {
  education?: EducationEntry[]
  [key: string]: unknown
}

type ExperienceEntry = {
  employer?: string | null
  jobType?: string | null
  from?: string | null
  to?: string | null
}

type ExperienceData = {
  experience?: ExperienceEntry[]
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

function generateAffidavitPDF(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as AffidavitData

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

  const title = "Čestné prohlášení"
  const titleSize = 18
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  const titleX = (pageWidth - titleWidth) / 2

  page.drawText(title, {
    x: titleX,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 40

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

  page.drawText(`ID dokumentu: ${docInfo.id} | Stav: ${docInfo.status}`, {
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
    "Výkon základní – náhradní – civilní vojenské služby",
    y,
    fontBold,
    pageWidth,
    margin
  )

  const militaryMap: Record<string, string> = {
    NONE: "není",
    BASIC: "základní",
    ALTERNATIVE: "náhradní",
    CIVIL: "civilní",
  }

  const militaryKey = data.militaryService ?? "NONE"
  const militaryValue = militaryMap[militaryKey] ?? militaryKey

  y = drawField(
    page,
    "Druh vojenské služby",
    militaryValue,
    y,
    font,
    fontBold,
    margin
  )
  y -= 10

  const maternityList: ChildCareItem[] =
    Array.isArray(data.maternityParental) && data.maternityParental.length > 0
      ? data.maternityParental
      : [{ childName: "", childBirthDate: "", from: "", to: "" }]

  checkPage()
  y = drawSectionHeader(
    page,
    "Doba mateřské a rodičovské dovolené",
    y,
    fontBold,
    pageWidth,
    margin
  )

  maternityList.forEach((item, idx) => {
    checkPage()
    page.drawText(`${idx + 1}. Záznam:`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 16

    y = drawField(
      page,
      "Jméno a příjmení dítěte",
      item.childName ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Datum narození",
      formatDate(item.childBirthDate ?? ""),
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    const period =
      item.from || item.to
        ? `${formatDate(item.from ?? "")} - ${formatDate(item.to ?? "")}`
        : ""
    y = drawField(page, "Období", period, y, font, fontBold, margin)
    y -= 8
  })

  const continuousList: ChildCareItem[] =
    Array.isArray(data.continuousCare) && data.continuousCare.length > 0
      ? data.continuousCare
      : [{ childName: "", childBirthDate: "", from: "", to: "" }]

  checkPage()
  y = drawSectionHeader(
    page,
    "Doba trvalé péče o dítě nebo děti",
    y,
    fontBold,
    pageWidth,
    margin
  )

  continuousList.forEach((item, idx) => {
    checkPage()
    page.drawText(`${idx + 1}. Záznam:`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 16

    y = drawField(
      page,
      "Jméno a příjmení dítěte",
      item.childName ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Datum narození",
      formatDate(item.childBirthDate ?? ""),
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    const period =
      item.from || item.to
        ? `${formatDate(item.from ?? "")} - ${formatDate(item.to ?? "")}`
        : ""
    y = drawField(page, "Období", period, y, font, fontBold, margin)
    y -= 8
  })

  const disabledList: ChildCareItem[] =
    Array.isArray(data.disabledChildCare) && data.disabledChildCare.length > 0
      ? data.disabledChildCare
      : [{ childName: "", childBirthDate: "", from: "", to: "" }]

  checkPage()
  y = drawSectionHeader(
    page,
    "Doba osobní péče o dlouhodobě těžce zdravotně postižené nezletilé dítě",
    y,
    fontBold,
    pageWidth,
    margin
  )

  disabledList.forEach((item, idx) => {
    checkPage()
    page.drawText(`${idx + 1}. Záznam:`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 16

    y = drawField(
      page,
      "Jméno a příjmení dítěte",
      item.childName ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Datum narození",
      formatDate(item.childBirthDate ?? ""),
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    const period =
      item.from || item.to
        ? `${formatDate(item.from ?? "")} - ${formatDate(item.to ?? "")}`
        : ""
    y = drawField(page, "Období", period, y, font, fontBold, margin)
    y -= 8
  })

  const unpaidList: UnpaidLeaveItem[] =
    Array.isArray(data.unpaidLeave) && data.unpaidLeave.length > 0
      ? data.unpaidLeave
      : [{ reason: "", from: "", to: "" }]

  checkPage()
  y = drawSectionHeader(
    page,
    "Pracovní volno bez náhrady platu/mzdy",
    y,
    fontBold,
    pageWidth,
    margin
  )

  unpaidList.forEach((item, idx) => {
    checkPage()
    page.drawText(`${idx + 1}. Případ:`, {
      x: margin + 10,
      y,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 16

    y = drawField(page, "Důvod", item.reason ?? "", y, font, fontBold, margin)
    checkPage()

    const period =
      item.from || item.to
        ? `${formatDate(item.from ?? "")} - ${formatDate(item.to ?? "")}`
        : ""
    y = drawField(page, "Období", period, y, font, fontBold, margin)
    y -= 8
  })

  checkPage()
  y = drawSectionHeader(
    page,
    "Čestné prohlášení",
    y,
    fontBold,
    pageWidth,
    margin
  )

  const truthfulText =
    data.isTruthful === true ? "Ano" : data.isTruthful === false ? "Ne" : ""

  drawField(
    page,
    "Potvrzuji pravdivost uvedených údajů",
    truthfulText,
    y,
    font,
    fontBold,
    margin
  )
}

function generatePersonalQuestionnairePDF(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as PersonalQuestionnaireData

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

  const title = "Osobní dotazník"
  const titleSize = 18
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  const titleX = (pageWidth - titleWidth) / 2

  page.drawText(title, {
    x: titleX,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 40

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
  y -= 20

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 25

  checkPage()
  y = drawSectionHeader(page, "Základní údaje", y, fontBold, pageWidth, margin)

  y = drawField(
    page,
    "Příjmení",
    data.lastName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Křestní jméno",
    data.firstName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Titul před jménem",
    data.titleBefore ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Titul za jménem",
    data.titleAfter ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Vědecká hodnost",
    data.academicDegrees ?? "",
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
    "Všechna další příjmení",
    data.otherSurnames ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Datum narození",
    formatDate(data.birthDate ?? ""),
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
    "Okres narození",
    data.birthDistrict ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Stát narození",
    data.birthState ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(page, "Telefon", data.phone ?? "", y, font, fontBold, margin)
  checkPage()

  y = drawField(
    page,
    "Státní občanství",
    data.citizenship ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Datová schránka",
    data.dataBoxId ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  const maritalStatusMap: Record<string, string> = {
    SINGLE: "Svobodný/á",
    MARRIED: "Vdaná/ženatý",
    DIVORCED: "Rozvedený/á",
    WIDOWED: "Vdova/vdovec",
    REGISTERED: "Registrované partnerství",
    UNSTATED: "Neuvádím",
  }

  const maritalText =
    data.maritalStatus && maritalStatusMap[data.maritalStatus]
      ? maritalStatusMap[data.maritalStatus]
      : (data.maritalStatus ?? "")

  y = drawField(page, "Rodinný stav", maritalText, y, font, fontBold, margin)
  checkPage()

  y = drawField(
    page,
    "Povolení k pobytu od",
    formatDate(data.foreignPermitFrom ?? ""),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Povolení k pobytu do",
    formatDate(data.foreignPermitTo ?? ""),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Povolení k pobytu vydal",
    data.foreignPermitAuthority ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(
    page,
    "Adresa trvalého pobytu",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Ulice",
    data.permanentStreet ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Číslo popisné/orientační",
    data.permanentHouseNumber ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Obec/část obce",
    data.permanentCity ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "PSČ",
    data.permanentPostcode ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(
    page,
    "Adresa pro doručování",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Ulice",
    data.correspondenceStreet ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Číslo popisné/orientační",
    data.correspondenceHouseNumber ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Obec/část obce",
    data.correspondenceCity ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "PSČ",
    data.correspondencePostcode ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(
    page,
    "Bankovní údaje a zdravotní pojišťovna",
    y,
    fontBold,
    pageWidth,
    margin
  )

  y = drawField(
    page,
    "Zdravotní pojišťovna",
    data.healthInsuranceCompany ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Číslo bankovního účtu",
    data.bankAccountNumber ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Bankovní instituce",
    data.bankName ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Kontaktní osoba pro mimořádné situace",
    data.maintenanceInfo ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  const yesNo = (v: boolean | undefined) =>
    v === true ? "Ano" : v === false ? "Ne" : ""

  y = drawField(
    page,
    "Doručování datovou schránkou",
    yesNo(data.dataBoxDelivery),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Pobírá dávky důchodového pojištění",
    yesNo(data.receivesPensionBenefits),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Druh důchodu",
    data.typePensionBenefits ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Osoba se zdravotním postižením",
    yesNo(data.isDisabledPerson),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Stupeň postižení",
    data.disabilityDegree ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  const children: ChildEntry[] =
    Array.isArray(data.children) && data.children.length > 0
      ? data.children
      : [{ fullName: "", birthDate: "" }]

  checkPage()
  y = drawSectionHeader(page, "Děti", y, fontBold, pageWidth, margin)

  children.forEach((child, idx) => {
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
      "Jméno a příjmení",
      child.fullName ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Datum narození",
      formatDate(child.birthDate ?? ""),
      y,
      font,
      fontBold,
      margin
    )
    y -= 8
  })

  const languages: LanguageEntry[] =
    Array.isArray(data.languages) && data.languages.length > 0
      ? data.languages
      : [{ name: "", level: "" }]

  checkPage()
  y = drawSectionHeader(
    page,
    "Znalost cizích jazyků",
    y,
    fontBold,
    pageWidth,
    margin
  )

  languages.forEach((lang) => {
    const label = lang.name ?? "Jazyk"
    const value = lang.level ?? ""
    y = drawField(page, label, value, y, font, fontBold, margin)
    checkPage()
  })

  checkPage()
  y = drawSectionHeader(page, "Osvědčení", y, fontBold, pageWidth, margin)

  y = drawField(
    page,
    "Osvědčení o vzdělávání vedoucích úředníků",
    yesNo(data.hasCertificateManagement),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Osvědčení o zvláštní odborné způsobilosti",
    yesNo(data.hasCertificateSpecial),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Osvědčení o vstupním školení",
    yesNo(data.hasCertificateTraining),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Osvědčení o vykonání úřednické zkoušky",
    yesNo(data.hasCertificateGeneral),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  checkPage()
  y = drawSectionHeader(page, "Závěrečné údaje", y, fontBold, pageWidth, margin)

  y = drawField(
    page,
    "Příbuzní na ÚMČ Praha 6",
    data.familyRelations ?? "",
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Žádost o převod vyúčtování platu na účet",
    yesNo(data.finalRequestPayrollTransfer),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  y = drawField(
    page,
    "Prohlašuji, že jsem nic nezamlčel(a) a údaje jsou pravdivé",
    yesNo(data.finalReadAndUnderstood),
    y,
    font,
    fontBold,
    margin
  )
  checkPage()

  drawField(
    page,
    "Zavazuji se oznamovat změny údajů",
    yesNo(data.finalTruthfulnessConfirm),
    y,
    font,
    fontBold,
    margin
  )
}

function generateEducationPDF(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as EducationData

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

  const title = "Přehled vzdělání"
  const titleSize = 18
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  const titleX = (pageWidth - titleWidth) / 2

  page.drawText(title, {
    x: titleX,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 40

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
  y -= 20

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 25

  const levelMap: Record<string, string> = {
    ZAKLADNI: "Základní",
    STREDNI: "Střední",
    STREDNI_ODBORNE: "Střední odborné",
    VOŠ: "Vyšší odborná škola",
    BAKALARSKE: "Bakalářské",
    MAGISTERSKE: "Magisterské",
    DOKTORSKE: "Doktorské",
  }

  const studyFormMap: Record<string, string> = {
    DENNI: "Denní",
    VECERNI: "Večerní",
    DISTANCNI: "Distanční",
    KOMBINOVANA: "Kombinovaná",
  }

  const educationList: EducationEntry[] =
    Array.isArray(data.education) && data.education.length > 0
      ? data.education
      : [
          {
            level: "",
            schoolType: "",
            semesters: "",
            studyForm: "",
            graduationYear: "",
            examType: "",
          },
        ]

  educationList.forEach((edu, idx) => {
    checkPage()
    y = drawSectionHeader(
      page,
      `Vzdělání ${idx + 1}`,
      y,
      fontBold,
      pageWidth,
      margin
    )

    const levelText =
      edu.level && levelMap[edu.level] ? levelMap[edu.level] : (edu.level ?? "")

    y = drawField(page, "Stupeň", levelText, y, font, fontBold, margin)
    checkPage()

    y = drawField(
      page,
      "Druh školy / obor",
      edu.schoolType ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    const formText =
      edu.studyForm && studyFormMap[edu.studyForm]
        ? studyFormMap[edu.studyForm]
        : (edu.studyForm ?? "")

    y = drawField(page, "Forma studia", formText, y, font, fontBold, margin)
    checkPage()

    y = drawField(
      page,
      "Počet tříd (semestrů)",
      edu.semesters ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Rok ukončení",
      edu.graduationYear ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Druh zkoušky",
      edu.examType ?? "",
      y,
      font,
      fontBold,
      margin
    )
    y -= 12
  })
}

function generateExperiencePDF(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  rawData: unknown,
  docInfo: DocumentInfo
): void {
  const data = (rawData ?? {}) as ExperienceData

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

  const title = "Přehled praxe"
  const titleSize = 18
  const titleWidth = fontBold.widthOfTextAtSize(title, titleSize)
  const titleX = (pageWidth - titleWidth) / 2

  page.drawText(title, {
    x: titleX,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 40

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
  y -= 20

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 25

  const experienceList: ExperienceEntry[] =
    Array.isArray(data.experience) && data.experience.length > 0
      ? data.experience
      : [{ employer: "", jobType: "", from: "", to: "" }]

  experienceList.forEach((exp, idx) => {
    checkPage()
    y = drawSectionHeader(
      page,
      `Pracovní zkušenost ${idx + 1}`,
      y,
      fontBold,
      pageWidth,
      margin
    )

    y = drawField(
      page,
      "Zaměstnavatel",
      exp.employer ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    y = drawField(
      page,
      "Druh práce",
      exp.jobType ?? "",
      y,
      font,
      fontBold,
      margin
    )
    checkPage()

    const period =
      exp.from || exp.to
        ? `${formatDate(exp.from ?? "")} - ${formatDate(exp.to ?? "")}`
        : ""

    y = drawField(page, "Období", period, y, font, fontBold, margin)
    y -= 12
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return new Response(JSON.stringify({ message: "Nejste přihlášen(a)." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const id = Number(params.id)
  if (!id || Number.isNaN(id)) {
    return new Response(JSON.stringify({ message: "Neplatné ID dokumentu." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
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

    switch (doc.type) {
      case "AFFIDAVIT":
        generateAffidavitPDF(
          pdfDoc,
          font,
          fontBold,
          doc.data as AffidavitData,
          docInfo
        )
        break
      case "PERSONAL_QUESTIONNAIRE":
        generatePersonalQuestionnairePDF(
          pdfDoc,
          font,
          fontBold,
          doc.data as PersonalQuestionnaireData,
          docInfo
        )
        break
      case "EDUCATION":
        generateEducationPDF(
          pdfDoc,
          font,
          fontBold,
          doc.data as EducationData,
          docInfo
        )
        break
      case "EXPERIENCE":
        generateExperiencePDF(
          pdfDoc,
          font,
          fontBold,
          doc.data as ExperienceData,
          docInfo
        )
        break
      default:
        throw new Error("Neznámý typ dokumentu")
    }

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
