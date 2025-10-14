import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(
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
      { status: "error", message: "Neplatné ID zaměstnance." },
      { status: 400 }
    )
  }

  try {
    const employee = await prisma.employeeOnboarding.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!employee) {
      return NextResponse.json(
        { status: "error", message: "Zaměstnanec nenalezen." },
        { status: 404 }
      )
    }

    const rows = await prisma.onboardingChangeLog.findMany({
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
      new Set(rows.map((r) => r.userId).filter((v): v is string => Boolean(v)))
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
    for (const u of users) {
      const label =
        [u.name, u.surname].filter(Boolean).join(" ") || u.email || u.id
      if (u.id) nameByKey.set(u.id, label)
      if (u.email) nameByKey.set(u.email, label)
    }

    // Výstupní data s čitelným jménem uživatele
    const data = rows.map((r) => ({
      ...r,
      displayUser:
        (r.userId && nameByKey.get(r.userId)) || r.userId || "Neznámý uživatel",
      createdAt: r.createdAt.toISOString(),
    }))

    const newest = data.at(0)?.createdAt ?? null
    const oldest = data.at(-1)?.createdAt ?? null

    return NextResponse.json({
      status: "success",
      data,
      summary: {
        total: data.length,
        actionTypes: Array.from(new Set(data.map((r) => r.action))),
        dateRange: newest && oldest ? { oldest, newest } : null,
      },
    })
  } catch (error) {
    console.error("GET /api/nastupy/[id]/history error:", error)
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
