import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  try {
    const records = await prisma.employeeChange.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        type: true,
        newPositionName: true,
        oldPositionName: true,
        newDepartment: true,
        oldDepartment: true,
        effectiveDate: true,
        personalNumber: true,
        deletedAt: true,
        deletedBy: true,
      },
    })

    const data = await Promise.all(
      records.map(async (r) => {
        let deletedByName = r.deletedBy ?? "Neznámý"
        if (r.deletedBy) {
          try {
            const user = await prisma.user.findFirst({
              where: { OR: [{ id: r.deletedBy }, { email: r.deletedBy }] },
              select: { name: true, surname: true, email: true },
            })
            if (user?.name && user?.surname)
              deletedByName = `${user.name} ${user.surname}`
            else if (user?.email) deletedByName = user.email
          } catch {}
        }

        return {
          id: r.id,
          titleBefore: r.titleBefore,
          name: r.name,
          surname: r.surname,
          titleAfter: r.titleAfter,
          positionName: r.newPositionName ?? r.oldPositionName ?? "–",
          department: r.newDepartment ?? r.oldDepartment ?? "–",
          unitName: null,
          personalNumber: r.personalNumber,
          effectiveDate: r.effectiveDate.toISOString(),
          deletedAt: r.deletedAt!.toISOString(),
          deletedBy: deletedByName,
        }
      })
    )

    return NextResponse.json({ status: "success", data })
  } catch (err) {
    console.error("GET /api/zmeny/deleted error:", err)
    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst smazané změny." },
      { status: 500 }
    )
  }
}
