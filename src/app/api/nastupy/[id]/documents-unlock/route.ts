import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { recomputeOnboardingReadiness } from "@/lib/onboarding-readiness"
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
      { message: "Nemáte oprávnění odemknout dokumenty." },
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

  if (existing.documentsReadinessStatus !== "LOCKED") {
    return NextResponse.json(
      { message: "Dokumenty nejsou uzamčené." },
      { status: 400 }
    )
  }

  const unlockedBy = session.user.name ?? session.user.email ?? "unknown"
  const userId = (session.user as { id?: string }).id

  await prisma.$transaction(async (tx) => {
    await tx.employeeOnboarding.update({
      where: { id: onboardingId },
      data: {
        documentsReadinessStatus: "READY",
        documentsLockedAt: null,
        documentsLockedBy: null,
      },
    })

    if (userId) {
      await tx.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "UPDATED",
          field: "documents_readiness",
          oldValue: "LOCKED",
          newValue: `Odemčeno (${unlockedBy})`,
        },
      })
    }
  })

  await recomputeOnboardingReadiness(onboardingId)

  return NextResponse.json({ ok: true })
}
