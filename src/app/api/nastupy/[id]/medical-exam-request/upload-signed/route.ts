import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILE_SIZE = 10 * 1024 * 1024

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění nahrát podepsanou žádost." },
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

  const formData = await req.formData().catch(() => null)
  const file = formData?.get("file")

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { message: "Nebyl vybrán žádný soubor." },
      { status: 400 }
    )
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { message: "Nahrajte prosím podepsanou žádost ve formátu PDF." },
      { status: 400 }
    )
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { message: "Soubor je prázdný nebo příliš velký (max 10 MB)." },
      { status: 400 }
    )
  }

  const fileData = Buffer.from(await file.arrayBuffer())
  const uploadedBy = session.user.name ?? session.user.email ?? "unknown"
  const userId = (session.user as { id?: string }).id

  const uploaded = await prisma.$transaction(async (tx) => {
    const result = await tx.medicalExamSignedFile.create({
      data: {
        onboardingId,
        fileName: file.name || "zadost-podepsana.pdf",
        fileData,
        uploadedBy,
      },
      select: { id: true, fileName: true, uploadedAt: true, uploadedBy: true },
    })

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "CREATED",
          field: "medical_exam_signed_file",
          oldValue: null,
          newValue: `Nahrána podepsaná žádost o pracovnělékařskou prohlídku (${result.fileName}).`,
        },
      })
    }

    return result
  })

  return NextResponse.json({ data: uploaded })
}
