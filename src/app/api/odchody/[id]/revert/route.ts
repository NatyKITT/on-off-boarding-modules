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

    const before = await prisma.employeeOffboarding.findFirst({
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

    if (!before.actualEnd) {
      return NextResponse.json(
        {
          status: "error",
          message: "Tento záznam je již v plánovaných odchodech.",
        },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedRecord = await tx.employeeOffboarding.update({
        where: { id },
        data: {
          actualEnd: null,
          status: "NEW",
          updatedAt: new Date(),
        },
      })

      await tx.offboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "REVERTED",
          field: "actualEnd",
          oldValue: before.actualEnd?.toISOString() || null,
          newValue: null,
        },
      })

      await tx.offboardingChangeLog.create({
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
      plannedEnd: updated.plannedEnd?.toISOString() || null,
      actualEnd: updated.actualEnd?.toISOString() || null,
      noticeEnd: updated.noticeEnd?.toISOString() || null,
      noticeMonths: updated.noticeMonths ?? 2,
      hasCustomDates: updated.hasCustomDates ?? false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return NextResponse.json({
      status: "success",
      data: responseData,
      message: "Odchod byl vrácen do plánovaných.",
    })
  } catch (err) {
    console.error("Chyba při vracení odchodu:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vracení odchodu.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
