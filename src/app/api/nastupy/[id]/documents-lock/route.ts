import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
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
      { message: "Nemáte oprávnění uzamknout dokumenty." },
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

  if (existing.documentsReadinessStatus !== "READY") {
    return NextResponse.json(
      {
        message:
          "Zamknout lze až ve chvíli, kdy jsou nástupní dokumenty i žádost o pracovnělékařskou prohlídku kompletně hotové (100 %).",
      },
      { status: 400 }
    )
  }

  const lockedBy = session.user.name ?? session.user.email ?? "unknown"
  const now = new Date()
  const userId = (session.user as { id?: string }).id

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id: onboardingId },
      data: {
        documentsReadinessStatus: "LOCKED",
        documentsLockedAt: now,
        documentsLockedBy: lockedBy,
      },
    })

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "UPDATED",
          field: "documents_readiness",
          oldValue: "READY",
          newValue: "LOCKED",
        },
      })
    }
  })

  return NextResponse.json({ ok: true, lockedAt: now, lockedBy })
}
