import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  try {
    const deletedRecords = await prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        surname: true,
        titleBefore: true,
        titleAfter: true,
        positionName: true,
        department: true,
        unitName: true,
        plannedEnd: true,
        actualEnd: true,
        personalNumber: true,
        deletedAt: true,
        deletedBy: true,
      },
      orderBy: {
        deletedAt: "desc",
      },
    })

    const userKeys = Array.from(
      new Set(
        deletedRecords
          .map((r) => r.deletedBy)
          .filter((v): v is string => Boolean(v))
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
    for (const u of users) {
      const label =
        [u.name, u.surname].filter(Boolean).join(" ") || u.email || u.id
      if (u.id) nameByKey.set(u.id, label)
      if (u.email) nameByKey.set(u.email, label)
    }

    const data = deletedRecords.map((r) => ({
      id: r.id,
      name: r.name,
      surname: r.surname,
      titleBefore: r.titleBefore,
      titleAfter: r.titleAfter,
      positionName: r.positionName,
      department: r.department,
      unitName: r.unitName,
      plannedEnd: r.plannedEnd?.toISOString() ?? null,
      actualEnd: r.actualEnd?.toISOString() ?? null,
      personalNumber: r.personalNumber,
      deletedAt: r.deletedAt!.toISOString(),
      deletedBy:
        (r.deletedBy && nameByKey.get(r.deletedBy)) ||
        r.deletedBy ||
        "Neznámý uživatel",
    }))

    return NextResponse.json({
      status: "success",
      data,
    })
  } catch (error) {
    console.error("GET /api/odchody/deleted error:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst smazané záznamy.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
