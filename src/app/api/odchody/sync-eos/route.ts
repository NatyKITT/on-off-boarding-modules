import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  try {
    const { offboardingId } = await req.json()
    if (!offboardingId) {
      return NextResponse.json(
        { error: "ID odchodu je povinné." },
        { status: 400 }
      )
    }

    const offboarding = await prisma.employeeOffboarding.findUnique({
      where: { id: offboardingId, deletedAt: null },
    })
    if (!offboarding || !offboarding.personalNumber) {
      return NextResponse.json(
        { error: "Odchod nenalezen nebo nemá osobní číslo." },
        { status: 404 }
      )
    }

    const employees = await getEmployees(offboarding.personalNumber)
    const employee = employees.find(
      (e) => e.personalNumber === offboarding.personalNumber
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
