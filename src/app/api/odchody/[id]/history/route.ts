import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canReadOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function normalizeAction(action: string) {
  if (action === "CREATED") return "CREATE"
  if (action === "UPDATED") return "UPDATE"
  if (action === "DELETED") return "DELETE"

  return action
}

export async function GET(
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

  if (!canReadOffboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit historii odchodu.",
      },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID zaměstnance." },
      { status: 400 }
    )
  }

  try {
    const employee = await prisma.employeeOffboarding.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!employee) {
      return NextResponse.json(
        { status: "error", message: "Zaměstnanec nenalezen." },
        { status: 404 }
      )
    }

    const rows = await prisma.offboardingChangeLog.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        employeeId: true,
        userId: true,
        action: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        ipAddress: true,
        userAgent: true,
      },
    })

    const userKeys = Array.from(
      new Set(
        rows
          .map((row) => row.userId)
          .filter((value): value is string => Boolean(value))
      )
    )

    const users =
      userKeys.length > 0
        ? await prisma.user.findMany({
            where: {
              OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }],
            },
            select: { id: true, email: true, name: true, surname: true },
          })
        : []

    const nameByKey = new Map<string, string>()

    for (const user of users) {
      const label =
        [user.name, user.surname].filter(Boolean).join(" ") ||
        user.email ||
        user.id

      if (user.id) nameByKey.set(user.id, label)
      if (user.email) nameByKey.set(user.email, label)
    }

    const data = rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      userId: row.userId,
      displayUser:
        (row.userId && nameByKey.get(row.userId)) ||
        row.userId ||
        "Neznámý uživatel",
      action: normalizeAction(row.action),
      field: row.field ?? null,
      oldValue: row.oldValue ?? null,
      newValue: row.newValue ?? null,
      createdAt: row.createdAt.toISOString(),
    }))

    const newest = data.at(0)?.createdAt ?? null
    const oldest = data.at(-1)?.createdAt ?? null

    return NextResponse.json({
      status: "success",
      data,
      summary: {
        total: data.length,
        actionTypes: Array.from(new Set(data.map((row) => row.action))),
        dateRange: newest && oldest ? { oldest, newest } : null,
      },
    })
  } catch (error) {
    console.error("GET /api/odchody/[id]/history error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst historii změn.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
