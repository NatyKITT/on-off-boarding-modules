import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, EmploymentDocumentType, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  canManageEmploymentDocuments,
  canReadEmploymentDocuments,
} from "@/lib/rbac"
import {
  affidavitSchema,
  payrollInfoSchema,
  personalQuestionnaireSchema,
} from "@/lib/validations/employment-documents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

function formatZodMessage(error: {
  issues: { path: (string | number)[]; message: string }[]
}) {
  const messages = error.issues.map((issue) => issue.message)
  const unique = Array.from(new Set(messages))
  return unique.slice(0, 5).join(" ")
}

const FIELD_LABELS: Partial<
  Record<EmploymentDocumentType, Record<string, string>>
> = {
  AFFIDAVIT: {
    noExperience: "Nemám žádnou praxi",
    experience: "Praxe",
    militaryService: "Vojenská/civilní služba",
    maternityParental: "Mateřská/rodičovská dovolená",
    continuousCare: "Trvalá péče o dítě",
    disabledChildCare: "Péče o zdravotně postižené dítě",
    closeRelativeCare: "Péče o osobu blízkou",
    doctoralStudy: "Doktorské studium",
    unpaidLeave: "Neplacené volno",
    isTruthful: "Potvrzení pravdivosti",
  },
  PAYROLL_INFO: {
    fullName: "Jméno a příjmení",
    maidenName: "Rodné příjmení",
    birthPlace: "Místo narození",
    birthNumber: "Rodné číslo",
    birthDay: "Den narození",
    birthMonth: "Měsíc narození",
    birthYear: "Rok narození",
    maritalStatus: "Rodinný stav",
    permanentStreet: "Ulice",
    permanentHouseNumber: "Číslo popisné / orientační",
    permanentCity: "Obec",
    permanentPostcode: "PSČ",
    children: "Děti",
    healthInsuranceCompany: "Zdravotní pojišťovna",
    bankAccountNumber: "Číslo účtu",
    bankName: "Banka",
    confirmTruthfulness: "Potvrzení prohlášení",
    signatureDate: "Datum odeslání",
  },
  PERSONAL_QUESTIONNAIRE: {
    lastName: "Příjmení",
    firstName: "Křestní jméno",
    titleBefore: "Titul před jménem",
    titleAfter: "Titul za jménem",
    academicDegrees: "Vědecká hodnost",
    maidenName: "Rodné příjmení",
    otherSurnames: "Všechna další příjmení",
    birthDate: "Datum narození",
    birthNumber: "Rodné číslo",
    birthPlace: "Místo narození",
    birthDistrict: "Okres narození",
    birthState: "Stát narození",
    phone: "Telefon",
    citizenship: "Státní občanství",
    dataBoxId: "Datová schránka",
    dataBoxDelivery: "Doručování datovou schránkou",
    maritalStatus: "Rodinný stav",
    foreignPermitFrom: "Povolení k pobytu od",
    foreignPermitTo: "Povolení k pobytu do",
    foreignPermitAuthority: "Povolení k pobytu vydal",
    permanentStreet: "Ulice (trvalý pobyt)",
    permanentHouseNumber: "Číslo popisné / orientační (trvalý pobyt)",
    permanentCity: "Obec (trvalý pobyt)",
    permanentPostcode: "PSČ (trvalý pobyt)",
    correspondenceStreet: "Ulice (doručování)",
    correspondenceHouseNumber: "Číslo popisné / orientační (doručování)",
    correspondenceCity: "Obec (doručování)",
    correspondencePostcode: "PSČ (doručování)",
    healthInsuranceCompany: "Zdravotní pojišťovna",
    bankAccountNumber: "Číslo účtu",
    bankName: "Banka",
    maintenanceInfo: "Kontaktní osoba pro mimořádné situace",
    isDisabledPerson: "Osoba se zdravotním postižením",
    receivesPensionBenefits: "Pobírá dávky důchodového pojištění",
    typePensionBenefits: "Druh důchodu",
    disabilityDegree: "Stupeň postižení",
    hasCertificateManagement: "Osvědčení – vedoucí úředníci",
    hasCertificateSpecial: "Osvědčení – zvláštní odborná způsobilost",
    certificateSpecialName: "Jaké osvědčení",
    hasCertificateTraining: "Osvědčení – vstupní školení",
    hasCertificateGeneral: "Osvědčení – úřednická zkouška",
    languages: "Znalost cizích jazyků",
    education: "Vzdělání",
    familyRelations: "Příbuzní na ÚMČ Praha 6",
    finalRequestPayrollTransfer: "Žádost o převod platu na účet",
    finalReadAndUnderstood: "Potvrzení pravdivosti údajů",
    finalTruthfulnessConfirm: "Závazek oznamovat změny",
  },
}

function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "boolean") return value ? "Ano" : "Ne"
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} položek` : "—"
  }
  if (typeof value === "object") return "změněno"
  return String(value)
}

type FieldChange = {
  field: string
  label: string
  oldValue: string
  newValue: string
}

function diffTopLevelFields(
  type: EmploymentDocumentType,
  oldData: unknown,
  newData: unknown
): FieldChange[] {
  const labels = FIELD_LABELS[type] ?? {}
  const oldObj =
    oldData && typeof oldData === "object"
      ? (oldData as Record<string, unknown>)
      : {}
  const newObj =
    newData && typeof newData === "object"
      ? (newData as Record<string, unknown>)
      : {}

  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  const changes: FieldChange[] = []

  for (const key of keys) {
    const oldVal = oldObj[key]
    const newVal = newObj[key]

    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue

    changes.push({
      field: key,
      label: labels[key] ?? key,
      oldValue: formatDiffValue(oldVal),
      newValue: formatDiffValue(newVal),
    })
  }

  return changes
}

function summarizeChanges(changes: FieldChange[]): string | null {
  if (changes.length === 0) return null

  return changes
    .map((change) => `${change.label}: ${change.oldValue} → ${change.newValue}`)
    .join("; ")
}

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění zobrazit dokument." },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { message: "Neplatné ID dokumentu." },
      { status: 400 }
    )
  }

  const doc = await prisma.employmentDocument.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      data: true,
      isLocked: true,
      completedAt: true,
      expiresAt: true,
      lastEditedBy: true,
      lastEditedAt: true,
      lastEditSummary: true,
      onboarding: {
        select: {
          name: true,
          surname: true,
        },
      },
    },
  })

  if (!doc) {
    return NextResponse.json(
      { message: "Dokument nebyl nalezen." },
      { status: 404 }
    )
  }

  return NextResponse.json({ document: doc })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění upravovat dokument." },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { message: "Neplatné ID dokumentu." },
      { status: 400 }
    )
  }

  const existing = await prisma.employmentDocument.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      isLocked: true,
      data: true,
    },
  })

  if (!existing) {
    return NextResponse.json(
      { message: "Dokument nebyl nalezen." },
      { status: 404 }
    )
  }

  if (existing.isLocked) {
    return NextResponse.json(
      { message: "Dokument je uzamčený. Nejdříve ho odemkněte." },
      { status: 423 }
    )
  }

  const wasAlreadyFilled =
    existing.status === DocumentStatus.COMPLETED ||
    existing.status === DocumentStatus.SIGNED

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object" || !("data" in body)) {
    return NextResponse.json(
      { message: "Neplatná data dokumentu." },
      { status: 400 }
    )
  }

  let validatedData: unknown = body.data

  const schema =
    existing.type === EmploymentDocumentType.AFFIDAVIT
      ? affidavitSchema
      : existing.type === EmploymentDocumentType.PERSONAL_QUESTIONNAIRE
        ? personalQuestionnaireSchema
        : existing.type === EmploymentDocumentType.PAYROLL_INFO
          ? payrollInfoSchema
          : null

  if (schema) {
    const parsed = schema.safeParse(body.data)

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            formatZodMessage(parsed.error) ||
            "Formulář obsahuje nevyplněné nebo chybné údaje.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    validatedData = parsed.data
  }

  try {
    const editedBy =
      session.user.name ?? session.user.email ?? "neznámý uživatel"
    const editedAt = new Date()

    const changes = wasAlreadyFilled
      ? diffTopLevelFields(existing.type, existing.data, validatedData)
      : []
    const editSummary = summarizeChanges(changes)

    const doc = await prisma.employmentDocument.update({
      where: { id },
      data: {
        data: validatedData as Prisma.InputJsonValue,
        status: DocumentStatus.COMPLETED,
        completedAt: wasAlreadyFilled ? undefined : editedAt,
        lastEditedBy: editedBy,
        lastEditedAt: editedAt,
        lastEditSummary: editSummary,
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        type: true,
        isLocked: true,
        lastEditedBy: true,
        lastEditedAt: true,
        lastEditSummary: true,
      },
    })

    return NextResponse.json({ document: doc, changes })
  } catch (error) {
    console.error("PATCH /api/dokumenty/internal/[id] error", error)

    return NextResponse.json(
      { message: "Uložení dokumentu se nezdařilo." },
      { status: 500 }
    )
  }
}
