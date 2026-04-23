import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

export async function POST(request: NextRequest, { params }: Params) {
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
    const body = await request.json().catch(() => ({}))
    const reason = String(body.reason || "").trim()

    if (!reason) {
      return NextResponse.json(
        { status: "error", message: "Důvod zrušení je povinný." },
        { status: 400 }
      )
    }

    const userKey =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const user = await prisma.user.findUnique({
      where: {
        id: (session.user as { id?: string }).id ?? undefined,
      },
      select: {
        name: true,
        surname: true,
        email: true,
      },
    })

    const userName =
      user?.name && user?.surname
        ? `${user.name} ${user.surname}`
        : (user?.email ?? userKey)

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

    if (before.cancelledAt) {
      return NextResponse.json(
        { status: "error", message: "Tento nástup je již zrušen." },
        { status: 409 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const cancelledAt = new Date()

      const updatedRecord = await tx.employeeOnboarding.update({
        where: { id },
        data: {
          cancelledAt,
          cancelledBy: userName,
          cancelReason: reason,
          status: "CANCELLED",
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "CANCELLED",
          field: "status",
          oldValue: before.status,
          newValue: "CANCELLED",
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "CANCELLED",
          field: "cancel_reason",
          oldValue: null,
          newValue: reason,
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: userKey,
          action: "CANCELLED",
          field: "cancelled_by",
          oldValue: null,
          newValue: userName,
        },
      })

      return updatedRecord
    })

    return NextResponse.json({
      status: "success",
      message: "Nástup byl zrušen.",
      data: {
        id: updated.id,
        cancelledAt: updated.cancelledAt?.toISOString(),
        cancelledBy: updated.cancelledBy,
        cancelReason: updated.cancelReason,
      },
    })
  } catch (error) {
    console.error("Error cancelling onboarding:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při rušení nástupu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
