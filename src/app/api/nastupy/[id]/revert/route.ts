import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

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

    if (!before.actualStart) {
      return NextResponse.json(
        {
          status: "error",
          message: "Tento záznam je již v plánovaných nástupech.",
        },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: {
          actualStart: null,
          status: "NEW",
          updatedAt: new Date(),
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "REVERTED",
          field: "actualStart",
          oldValue: before.actualStart?.toISOString() || null,
          newValue: null,
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "STATUS_CHANGED",
          field: "status",
          oldValue: before.status,
          newValue: "NEW",
        },
      })

      return updatedRecord
    })

    const responseData = {
      ...updated,
      plannedStart: updated.plannedStart?.toISOString() || null,
      actualStart: updated.actualStart?.toISOString() || null,
      probationEnd: updated.probationEnd?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
      message: "Nástup byl vrácen do plánovaných.",
    })
  } catch (err) {
    console.error("Chyba při vracení nástupu:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vracení nástupu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
