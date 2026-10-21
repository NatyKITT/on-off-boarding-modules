import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { MedicalExamVariant } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { MEDICAL_EXAM_TYPE_OPTIONS } from "@/lib/medical-exam-request-shared"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const patchSchema = z.object({
  medicalExamJobTitle: z.string().trim().optional().nullable(),
  medicalExamJobDescription: z.string().trim().optional().nullable(),
  medicalExamWorkRegime: z.string().trim().optional().nullable(),
  medicalExamRiskFactors: z.string().trim().optional().nullable(),
  medicalExamWorkCategory: z
    .enum(["1", "2", "2R", "3", "4"])
    .optional()
    .nullable(),
  medicalExamProfessionalRisk: z.string().trim().optional().nullable(),
  medicalExamType: z
    .enum([...MEDICAL_EXAM_TYPE_OPTIONS] as [string, ...string[]])
    .optional()
    .nullable(),
  medicalExamExamReason: z.string().trim().optional().nullable(),
  medicalExamVariant: z.nativeEnum(MedicalExamVariant).optional().nullable(),
  medicalExamAppointmentAt: z.string().datetime().optional().nullable(),
  medicalExamSelfArranged: z.boolean().optional(),
  medicalExamBirthDate: z.string().datetime().optional().nullable(),
  medicalExamAddress: z.string().trim().optional().nullable(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) {
    return NextResponse.json(
      { message: "Neplatné ID nástupu." },
      { status: 400 }
    )
  }

  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: {
      positionName: true,
      medicalExamJobTitle: true,
      medicalExamJobDescription: true,
      medicalExamWorkRegime: true,
      medicalExamRiskFactors: true,
      medicalExamWorkCategory: true,
      medicalExamProfessionalRisk: true,
      medicalExamType: true,
      medicalExamExamReason: true,
      medicalExamVariant: true,
      medicalExamAppointmentAt: true,
      medicalExamSelfArranged: true,
      medicalExamBirthDate: true,
      medicalExamAddress: true,
      medicalExamRequestGeneratedAt: true,
      medicalExamRequestSentAt: true,
      medicalExamRequestSentBy: true,
      documentsReadinessStatus: true,
      documentsReadyAt: true,
      documentsLockedAt: true,
      documentsLockedBy: true,
      documents: {
        where: { type: "PERSONAL_QUESTIONNAIRE" },
        select: { completedAt: true, data: true },
        take: 1,
      },
      medicalExamSignedFiles: {
        orderBy: { uploadedAt: "desc" },
        take: 1,
        select: { fileName: true, uploadedAt: true, uploadedBy: true },
      },
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  const questionnaireData =
    (onboarding.documents[0]?.data as Record<string, unknown> | null) ?? {}

  const questionnaireBirthDate =
    typeof questionnaireData.birthDate === "string" &&
    questionnaireData.birthDate.trim()
      ? questionnaireData.birthDate.trim()
      : null

  const questionnaireAddressParts = [
    [
      typeof questionnaireData.permanentStreet === "string"
        ? questionnaireData.permanentStreet.trim()
        : "",
      typeof questionnaireData.permanentHouseNumber === "string"
        ? questionnaireData.permanentHouseNumber.trim()
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    [
      typeof questionnaireData.permanentPostcode === "string"
        ? questionnaireData.permanentPostcode.trim()
        : "",
      typeof questionnaireData.permanentCity === "string"
        ? questionnaireData.permanentCity.trim()
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean)
  const questionnaireAddress = questionnaireAddressParts.length
    ? questionnaireAddressParts.join(", ")
    : null

  return NextResponse.json({
    data: {
      positionNameSuggestion: onboarding.positionName,
      medicalExamJobTitle: onboarding.medicalExamJobTitle,
      medicalExamJobDescription: onboarding.medicalExamJobDescription,
      medicalExamWorkRegime: onboarding.medicalExamWorkRegime,
      medicalExamRiskFactors: onboarding.medicalExamRiskFactors,
      medicalExamWorkCategory: onboarding.medicalExamWorkCategory,
      medicalExamProfessionalRisk: onboarding.medicalExamProfessionalRisk,
      medicalExamType: onboarding.medicalExamType,
      medicalExamExamReason: onboarding.medicalExamExamReason,
      medicalExamVariant: onboarding.medicalExamVariant,
      medicalExamAppointmentAt: onboarding.medicalExamAppointmentAt,
      medicalExamSelfArranged: onboarding.medicalExamSelfArranged,
      medicalExamBirthDate: onboarding.medicalExamBirthDate,
      medicalExamAddress: onboarding.medicalExamAddress,
      medicalExamRequestGeneratedAt: onboarding.medicalExamRequestGeneratedAt,
      medicalExamRequestSentAt: onboarding.medicalExamRequestSentAt,
      medicalExamRequestSentBy: onboarding.medicalExamRequestSentBy,
      personalQuestionnaireCompletedAt:
        onboarding.documents[0]?.completedAt ?? null,
      questionnaireBirthDate,
      questionnaireAddress,
      medicalExamSignedFile: onboarding.medicalExamSignedFiles[0] ?? null,
      documentsReadinessStatus: onboarding.documentsReadinessStatus,
      documentsReadyAt: onboarding.documentsReadyAt,
      documentsLockedAt: onboarding.documentsLockedAt,
      documentsLockedBy: onboarding.documentsLockedBy,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění upravovat tyto údaje." },
      { status: 403 }
    )
  }

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) {
    return NextResponse.json(
      { message: "Neplatné ID nástupu." },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const existing = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: { id: true, documentsReadinessStatus: true },
  })

  if (!existing) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  if (existing.documentsReadinessStatus === "LOCKED") {
    return NextResponse.json(
      {
        message:
          "Nástupní dokumenty jsou uzamčené jako hotové. Nejdřív je odemkněte.",
      },
      { status: 423 }
    )
  }

  const userId = (session.user as { id?: string }).id

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employeeOnboarding.update({
      where: { id: onboardingId },
      data: {
        medicalExamJobTitle: parsed.data.medicalExamJobTitle?.trim() || null,
        medicalExamJobDescription:
          parsed.data.medicalExamJobDescription?.trim() || null,
        medicalExamWorkRegime:
          parsed.data.medicalExamWorkRegime?.trim() || null,
        medicalExamRiskFactors:
          parsed.data.medicalExamRiskFactors?.trim() || null,
        medicalExamWorkCategory: parsed.data.medicalExamWorkCategory ?? null,
        medicalExamProfessionalRisk:
          parsed.data.medicalExamProfessionalRisk?.trim() || null,
        medicalExamType: parsed.data.medicalExamType ?? null,
        medicalExamExamReason:
          parsed.data.medicalExamExamReason?.trim() || null,
        medicalExamVariant: parsed.data.medicalExamVariant ?? null,
        medicalExamAppointmentAt: parsed.data.medicalExamAppointmentAt
          ? new Date(parsed.data.medicalExamAppointmentAt)
          : null,
        medicalExamSelfArranged: parsed.data.medicalExamSelfArranged ?? false,
        medicalExamBirthDate: parsed.data.medicalExamBirthDate
          ? new Date(parsed.data.medicalExamBirthDate)
          : null,
        medicalExamAddress: parsed.data.medicalExamAddress?.trim() || null,
      },
      select: {
        medicalExamJobTitle: true,
        medicalExamJobDescription: true,
        medicalExamWorkRegime: true,
        medicalExamRiskFactors: true,
        medicalExamWorkCategory: true,
        medicalExamProfessionalRisk: true,
        medicalExamType: true,
        medicalExamExamReason: true,
        medicalExamVariant: true,
        medicalExamAppointmentAt: true,
        medicalExamSelfArranged: true,
        medicalExamBirthDate: true,
        medicalExamAddress: true,
      },
    })

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "UPDATED",
          field: "medical_exam_request",
          oldValue: null,
          newValue: "Upraveny údaje k žádosti o pracovnělékařskou prohlídku.",
        },
      })
    }

    return result
  })

  return NextResponse.json({ data: updated })
}
