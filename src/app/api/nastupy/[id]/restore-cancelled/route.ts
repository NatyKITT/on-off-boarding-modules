import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

export async function POST(_: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  try {
    const userKey =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const before = await prisma.employeeOnboarding.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    })

    if (!before) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (!before.cancelledAt) {
      return NextResponse.json(
        { status: "error", message: "Tento nástup není zrušen." },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const newStatus = before.actualStart ? "COMPLETED" : "NEW"

      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: {
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: null,
          status: newStatus,
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "RESTORED",
          field: "cancelled_at",
          oldValue: before.cancelledAt?.toISOString() ?? null,
          newValue: null,
        },
      })

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      message: "Nástup byl obnoven.",
      data: {
        id: updated.id,
        status: updated.status,
      },
    })
  } catch (error) {
    console.error("Error restoring onboarding:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při obnovování nástupu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
