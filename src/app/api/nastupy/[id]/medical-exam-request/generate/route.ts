import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { buildMedicalExamRequestPdf } from "@/lib/medical-exam-request-pdf"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění generovat tento dokument." },
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

  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: {
      medicalExamJobDescription: true,
      medicalExamWorkCategory: true,
      medicalExamVariant: true,
      documents: {
        where: { type: "PERSONAL_QUESTIONNAIRE" },
        select: { completedAt: true },
        take: 1,
      },
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  if (!onboarding.documents[0]?.completedAt) {
    return NextResponse.json(
      {
        message:
          "Žádost lze vygenerovat až po vyplnění osobního dotazníku zaměstnancem.",
      },
      { status: 400 }
    )
  }

  if (
    !onboarding.medicalExamJobDescription ||
    !onboarding.medicalExamWorkCategory ||
    !onboarding.medicalExamVariant
  ) {
    return NextResponse.json(
      {
        message:
          "Nejdřív vyplňte druh práce, kategorii práce a variantu vstupní prohlídky.",
      },
      { status: 400 }
    )
  }

  const built = await buildMedicalExamRequestPdf(onboardingId)

  if (!built) {
    return NextResponse.json(
      { message: "Žádost se nepodařilo vygenerovat." },
      { status: 500 }
    )
  }

  await prisma.employeeOnboarding.update({
    where: { id: onboardingId },
    data: { medicalExamRequestGeneratedAt: new Date() },
  })

  return new Response(new Uint8Array(built.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Zadost-o-pracovnelekarskou-prohlidku-${built.employeeName.replace(/\s+/g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
