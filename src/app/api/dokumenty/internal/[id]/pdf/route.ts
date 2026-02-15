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
  titleBefore?: string | null
  titleAfter?: string | null
  positionName?: string | null
  department?: string | null
  unitName?: string | null
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
  jobType?: string | null
  from?: string | null
  to?: string | null
}

type AffidavitData = {
  experience?: ExperienceItem[]
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
  hasCertificateTraining?: boolean
  hasCertificateGeneral?: boolean
  familyRelations?: string | null
  finalRequestPayrollTransfer?: boolean
  finalReadAndUnderstood?: boolean
  finalTruthfulnessConfirm?: boolean
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
  y -= 12

  const rectHeight = 20
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

  return y - (rectHeight + 14)
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
    return y - 34
  }

  return y - 26
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
  y -= 20

  const affidavitNameParts = [
    docInfo.titleBefore,
    docInfo.employeeName,
    docInfo.titleAfter,
  ].filter(Boolean)
  const affidavitFullName = affidavitNameParts.join(" ")

  if (affidavitFullName) {
    checkPage()
    page.drawText(affidavitFullName, {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    })
    y -= 18
  }

  const orgLines: string[] = []
  if (docInfo.department) orgLines.push(docInfo.department)
  if (docInfo.positionName) orgLines.push(docInfo.positionName)

  orgLines.forEach((line) => {
    checkPage()
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
    y -= 13
  })

  if (orgLines.length > 0) y -= 4

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
  y -= 20
  checkPage()

  page.drawText("Já, níže podepsaný/á", {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  })
  y -= 16
  checkPage()

  if (affidavitFullName) {
    page.drawText(affidavitFullName, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    })
    y -= 18
    checkPage()
  }

  page.drawText("čestně prohlašuji,", {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  })
  y -= 20
  checkPage()

  const legalPara1 = [
    "že beru na vědomí, že Úřad městské části Praha 6 jako zaměstnavatel",
    "je povinen zařadit zaměstnance do platových stupňů při zařazení do",
    "platových tříd na základě délky praxe, kvalifikačních předpokladů a",
    "druhu výkonu práce v souladu s platnými právními předpisy, tj.",
    "zejména zákonem č. 262/2006 Sb., zákoník práce, ve znění pozdějších",
    "předpisů, nařízením vlády č. 341/2017 Sb., o platových poměrech",
    "zaměstnanců ve veřejných službách a správě a nařízením vlády č.",
    "222/2010 Sb., o katalogu prací ve veřejných službách a správě.",
  ]

  legalPara1.forEach((line) => {
    checkPage()
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 12
  })

  y -= 10
  checkPage()

  const legalPara2 = [
    "V souladu s uvedenými právními předpisy a na základě příkazu",
    "tajemníka č. 3/2025 dále prohlašuji, že všechny níže specifikované",
    "pracovní činnosti (druh práce), které jsem vykonával/a od prvního",
    "dne výkonu práce, uvádím pravdivě a úplně za účelem správného",
    "zařazení do příslušné platové třídy a platového stupně.",
  ]

  legalPara2.forEach((line) => {
    checkPage()
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 12
  })

  y -= 15

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= 30

  const experienceList: ExperienceItem[] =
    Array.isArray(data.experience) && data.experience.length > 0
      ? data.experience.filter((e) => e.employer || e.jobType || e.from || e.to)
      : []

  if (experienceList.length > 0) {
    checkPage()
    y = drawSectionHeader(page, "Praxe", y, fontBold, pageWidth, margin)

    experienceList.forEach((exp, idx) => {
      checkPage()
      page.drawText(`${idx + 1}. Zaměstnání:`, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 16

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
      y -= 8
    })
  }

  const militaryList: MilitaryServiceItem[] =
    Array.isArray(data.militaryService) && data.militaryService.length > 0
      ? data.militaryService.filter((m) => m.service || m.from || m.to)
      : []

  if (militaryList.length > 0) {
    checkPage()
    y = drawSectionHeader(
      page,
      "Výkon vojenské základní (náhradní) služby nebo civilní služby",
      y,
      fontBold,
      pageWidth,
      margin
    )

    const serviceMap: Record<string, string> = {
      BASIC: "základní",
      ALTERNATIVE: "náhradní",
      CIVIL: "civilní",
    }

    militaryList.forEach((mil, idx) => {
      checkPage()
      page.drawText(`${idx + 1}. Služba:`, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 16

      const serviceText =
        mil.service && serviceMap[mil.service]
          ? serviceMap[mil.service]
          : (mil.service ?? "")

      y = drawField(page, "Druh služby", serviceText, y, font, fontBold, margin)
      checkPage()

      const period =
        mil.from || mil.to
          ? `${formatDate(mil.from ?? "")} - ${formatDate(mil.to ?? "")}`
          : ""
      y = drawField(page, "Období", period, y, font, fontBold, margin)
      y -= 8
    })
  }

  const unpaidList: UnpaidLeaveItem[] =
    Array.isArray(data.unpaidLeave) && data.unpaidLeave.length > 0
      ? data.unpaidLeave.filter((u) => u.reason || u.from || u.to)
      : []

  if (unpaidList.length > 0) {
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
  }

  const maternityList: ChildCareItem[] =
    Array.isArray(data.maternityParental) && data.maternityParental.length > 0
      ? data.maternityParental.filter(
          (m) => m.childName || m.childBirthDate || m.from || m.to
        )
      : []

  if (maternityList.length > 0) {
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
  }

  const continuousList: ChildCareItem[] =
    Array.isArray(data.continuousCare) && data.continuousCare.length > 0
      ? data.continuousCare.filter(
          (c) => c.childName || c.childBirthDate || c.from || c.to
        )
      : []

  if (continuousList.length > 0) {
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
  }

  const disabledList: ChildCareItem[] =
    Array.isArray(data.disabledChildCare) && data.disabledChildCare.length > 0
      ? data.disabledChildCare.filter(
          (d) => d.childName || d.childBirthDate || d.from || d.to
        )
      : []

  if (disabledList.length > 0) {
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
  }

  const closeRelativeList: CloseRelativeCareItem[] =
    Array.isArray(data.closeRelativeCare) && data.closeRelativeCare.length > 0
      ? data.closeRelativeCare.filter(
          (c) => c.personName || c.dependencyLevel || c.from || c.to
        )
      : []

  if (closeRelativeList.length > 0) {
    checkPage()
    y = drawSectionHeader(
      page,
      "Doba péče o osobu blízkou",
      y,
      fontBold,
      pageWidth,
      margin
    )

    closeRelativeList.forEach((item, idx) => {
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
        "Jméno a příjmení osoby",
        item.personName ?? "",
        y,
        font,
        fontBold,
        margin
      )
      checkPage()

      const depLevel =
        item.dependencyLevel === "III"
          ? "III (těžká závislost)"
          : item.dependencyLevel === "IV"
            ? "IV (úplná závislost)"
            : (item.dependencyLevel ?? "")

      y = drawField(
        page,
        "Stupeň závislosti",
        depLevel,
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
  }

  const doctoralList: DoctoralStudyItem[] =
    Array.isArray(data.doctoralStudy) && data.doctoralStudy.length > 0
      ? data.doctoralStudy.filter(
          (d) => d.schoolName || d.studyProgram || d.from || d.to
        )
      : []

  if (doctoralList.length > 0) {
    checkPage()
    y = drawSectionHeader(
      page,
      "Doba řádně ukončeného studia v doktorském studijním programu",
      y,
      fontBold,
      pageWidth,
      margin
    )

    doctoralList.forEach((item, idx) => {
      checkPage()
      page.drawText(`${idx + 1}. Studium:`, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 16

      y = drawField(
        page,
        "Název vysoké školy",
        item.schoolName ?? "",
        y,
        font,
        fontBold,
        margin
      )
      checkPage()

      y = drawField(
        page,
        "Studijní program",
        item.studyProgram ?? "",
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
  }

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
  y -= 25

  const payrollDisplayName = data.fullName ?? docInfo.employeeName
  if (payrollDisplayName) {
    page.drawText(payrollDisplayName, {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    })
    y -= 18
  }

  const payrollOrgLines: string[] = []
  if (docInfo.department) payrollOrgLines.push(docInfo.department)
  if (docInfo.positionName) payrollOrgLines.push(docInfo.positionName)

  payrollOrgLines.forEach((line) => {
    checkPage()
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
    y -= 13
  })

  if (payrollOrgLines.length > 0) y -= 4

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
  y -= 30

  checkPage()
  y = drawSectionHeader(
    page,
    "Základní údaje zaměstnance",
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

  const birthDateParts = [
    data.birthDay,
    data.birthMonth,
    data.birthYear,
  ].filter(Boolean)
  const birthDateDisplay =
    birthDateParts.length > 0
      ? `${data.birthDay ?? ""}. ${data.birthMonth ?? ""}. ${data.birthYear ?? ""}`.trim()
      : ""

  y = drawField(
    page,
    "Datum narození",
    birthDateDisplay,
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
    "Zdravotní pojišťovna",
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
    "Zasílání platu/odměny na bankovní účet",
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
  y -= 25

  const pqParts = [
    (data as PersonalQuestionnaireData).titleBefore,
    (data as PersonalQuestionnaireData).firstName,
    (data as PersonalQuestionnaireData).lastName,
    (data as PersonalQuestionnaireData).titleAfter,
    (data as PersonalQuestionnaireData).academicDegrees,
  ].filter(Boolean)
  const pqDisplayName =
    pqParts.length > 0 ? pqParts.join(" ") : docInfo.employeeName

  if (pqDisplayName) {
    page.drawText(pqDisplayName, {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0.15, 0.39, 0.92),
    })
    y -= 18
  }

  const pqOrgLines: string[] = []
  if (docInfo.department) pqOrgLines.push(docInfo.department)
  if (docInfo.positionName) pqOrgLines.push(docInfo.positionName)

  pqOrgLines.forEach((line) => {
    checkPage()
    page.drawText(line, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
    y -= 13
  })

  if (pqOrgLines.length > 0) y -= 4

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
  y -= 30

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

  if (
    data.isDisabledPerson === true &&
    data.disabilityDegree &&
    data.disabilityDegree !== "NONE"
  ) {
    y = drawField(
      page,
      "Stupeň postižení",
      data.disabilityDegree,
      y,
      font,
      fontBold,
      margin
    )
    checkPage()
  }

  const levelMap: Record<string, string> = {
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

  const studyFormMap: Record<string, string> = {
    DENNI: "Denní",
    VECERNI: "Večerní",
    DALKOVE: "Dálkové",
    DISTANCNI: "Distanční",
    KOMBINOVANE: "Kombinované",
  }

  const educationList: EducationEntry[] =
    Array.isArray(data.education) && data.education.length > 0
      ? data.education.filter(
          (e) =>
            e.level ||
            e.schoolType ||
            e.semesters ||
            e.studyForm ||
            e.graduationYear ||
            e.examType
        )
      : []

  if (educationList.length > 0) {
    checkPage()
    y = drawSectionHeader(page, "Vzdělání", y, fontBold, pageWidth, margin)

    educationList.forEach((edu, idx) => {
      checkPage()
      page.drawText(`${idx + 1}. Vzdělání:`, {
        x: margin + 10,
        y,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      })
      y -= 16

      const levelText =
        edu.level && levelMap[edu.level]
          ? levelMap[edu.level]
          : (edu.level ?? "")

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

  const languages: LanguageEntry[] =
    Array.isArray(data.languages) && data.languages.length > 0
      ? data.languages.filter((l) => l.name || l.level)
      : []

  if (languages.length > 0) {
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
  }

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
            titleBefore: true,
            titleAfter: true,
            positionName: true,
            department: true,
            unitName: true,
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
      titleBefore: doc.onboarding?.titleBefore ?? null,
      titleAfter: doc.onboarding?.titleAfter ?? null,
      positionName: doc.onboarding?.positionName ?? null,
      department: doc.onboarding?.department ?? null,
      unitName: doc.onboarding?.unitName ?? null,
    }

    switch (doc.type) {
      case "AFFIDAVIT":
        generateAffidavitPDF(pdfDoc, font, fontBold, doc.data, docInfo)
        break
      case "PERSONAL_QUESTIONNAIRE":
        generatePersonalQuestionnairePDF(
          pdfDoc,
          font,
          fontBold,
          doc.data,
          docInfo
        )
        break
      case "PAYROLL_INFO":
        generatePayrollInfoPDF(pdfDoc, font, fontBold, doc.data, docInfo)
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
