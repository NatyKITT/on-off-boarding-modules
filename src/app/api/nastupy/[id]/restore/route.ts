import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type MaybeUser = { id?: string; email?: string } | null | undefined

function getUserKey(u: MaybeUser): string {
  if (u && typeof u === "object") {
    if (typeof u.id === "string" && u.id.length > 0) return u.id
    if (typeof u.email === "string" && u.email.length > 0) return u.email
  }
  return "unknown"
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const createdBy = getUserKey(session.user as MaybeUser)

  try {
    const employee = await prisma.employeeOnboarding.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        personalNumber: true,
        deletedAt: true,
        deletedBy: true,
        deleteReason: true,
      },
    })

    if (!employee) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (!employee.deletedAt) {
      return NextResponse.json(
        { status: "error", message: "Záznam není smazán." },
        { status: 409 }
      )
    }

    if (employee.personalNumber) {
      const existing = await prisma.employeeOnboarding.findFirst({
        where: {
          personalNumber: employee.personalNumber,
          deletedAt: null,
        },
      })

      if (existing) {
        return NextResponse.json(
          {
            status: "error",
            message: `Zaměstnanec s osobním číslem ${employee.personalNumber} již existuje v aktivních záznamech. Nelze obnovit.`,
          },
          { status: 409 }
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeOnboarding.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
        },
      })

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: createdBy,
          action: "RESTORED",
          field: "deleted_at",
          oldValue: employee.deletedAt?.toISOString() ?? null,
          newValue: null,
        },
      })

      try {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              kind: "employee_restored",
              employeeId: id,
              employeeName: `${employee.name} ${employee.surname}`,
              restoredBy: createdBy,
              originalDeletedBy: employee.deletedBy,
              originalDeleteReason: employee.deleteReason,
              recipients: [process.env.HR_NOTIFICATION_EMAILS || ""],
              subject: `Obnoven záznam zaměstnance - ${employee.name} ${employee.surname}`,
            },
            priority: 3,
            createdBy,
          },
        })
      } catch (mailError) {
        console.warn("Warning: Could not create mail queue entry:", mailError)
      }
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně obnoven.",
      data: {
        id: employee.id,
        name: `${employee.name} ${employee.surname}`,
        restoredAt: new Date().toISOString(),
        restoredBy: createdBy,
      },
    })
  } catch (error) {
    console.error("Chyba při obnovování záznamu:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při obnovování záznamu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
