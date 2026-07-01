import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canWriteOnboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type MaybeUser =
  | { id?: string | null; email?: string | null }
  | null
  | undefined

function getUserKey(user: MaybeUser): string {
  if (user && typeof user === "object") {
    if (typeof user.id === "string" && user.id.length > 0) return user.id
    if (typeof user.email === "string" && user.email.length > 0) {
      return user.email
    }
  }

  return "unknown"
}

function parseEmailList(value?: string): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter((email) => email.length > 0 && email.includes("@"))
}

function getHrNotificationRecipients(): string[] {
  return Array.from(
    new Set([
      ...parseEmailList(process.env.HR_NOTIFICATION_EMAILS),
      ...parseEmailList(process.env.HR_EMAILS),
    ])
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canWriteOnboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění obnovovat nástupy.",
      },
      { status: 403 }
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
        select: {
          id: true,
          name: true,
          surname: true,
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

    const hrRecipients = getHrNotificationRecipients()
    const restoredAt = new Date()

    await prisma.$transaction(async (tx) => {
      await tx.employeeOnboarding.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          updatedAt: restoredAt,
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

      await tx.onboardingChangeLog.create({
        data: {
          employeeId: id,
          userId: createdBy,
          action: "RESTORED",
          field: "restore_info",
          oldValue: JSON.stringify({
            deletedBy: employee.deletedBy,
            deleteReason: employee.deleteReason,
          }),
          newValue: JSON.stringify({
            restoredBy: createdBy,
            restoredAt: restoredAt.toISOString(),
          }),
        },
      })

      if (hrRecipients.length > 0) {
        await tx.mailQueue.create({
          data: {
            type: "SYSTEM_NOTIFICATION",
            payload: {
              kind: "employee_restored",
              employeeId: id,
              employeeName: `${employee.name} ${employee.surname}`,
              restoredBy: createdBy,
              restoredAt: restoredAt.toISOString(),
              originalDeletedBy: employee.deletedBy,
              originalDeleteReason: employee.deleteReason,
              recipients: hrRecipients,
              subject: `Obnoven záznam zaměstnance - ${employee.name} ${employee.surname}`,
            },
            priority: 3,
            createdBy,
          },
        })
      }
    })

    return NextResponse.json({
      status: "success",
      message: "Záznam byl úspěšně obnoven.",
      data: {
        id: employee.id,
        name: `${employee.name} ${employee.surname}`,
        restoredAt: restoredAt.toISOString(),
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
