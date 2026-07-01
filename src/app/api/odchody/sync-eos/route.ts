import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
import { canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canWriteOffboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění synchronizovat odchod s EOS.",
      },
      { status: 403 }
    )
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      offboardingId?: unknown
    } | null

    const offboardingId = Number(body?.offboardingId)

    if (!Number.isFinite(offboardingId)) {
      return NextResponse.json(
        { error: "ID odchodu je povinné." },
        { status: 400 }
      )
    }

    const offboarding = await prisma.employeeOffboarding.findFirst({
      where: {
        id: offboardingId,
        deletedAt: null,
      },
    })

    if (!offboarding || !offboarding.personalNumber) {
      return NextResponse.json(
        { error: "Odchod nenalezen nebo nemá osobní číslo." },
        { status: 404 }
      )
    }

    const employees = await getEmployees(offboarding.personalNumber)

    const employee = employees.find(
      (item) => item.personalNumber === offboarding.personalNumber
    )

    if (!employee) {
      return NextResponse.json({
        status: "info",
        message: "Zaměstnanec již není v EOS systému.",
        eosData: null,
      })
    }

    const updated = await prisma.employeeOffboarding.update({
      where: { id: offboardingId },
      data: {
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
        userEmail: employee.email || offboarding.userEmail,
        userName: employee.userName ?? offboarding.userName,
        positionNum: employee.positionNum,
        positionName: employee.positionName,
        department: employee.department,
        unitName: employee.unitName,
      },
    })

    return NextResponse.json({
      status: "success",
      message: "Data synchronizována s EOS.",
      data: updated,
    })
  } catch (error) {
    console.error("Chyba při synchronizaci s EOS:", error)

    if (
      error instanceof Error &&
      error.message.includes("EOS hledání selhalo")
    ) {
      return NextResponse.json(
        { error: "EOS služba není dostupná." },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: "Nepodařilo se synchronizovat s EOS." },
      { status: 500 }
    )
  }
}
