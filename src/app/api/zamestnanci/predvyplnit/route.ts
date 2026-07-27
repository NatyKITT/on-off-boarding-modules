import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { getEmployees, type Employee } from "@/lib/eos-employees"
import { canReadInternalApp } from "@/lib/rbac"
import { getSentryEnvironment } from "@/lib/sentry-environment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function employeeToOffboardingData(employee: Employee) {
  return {
    titleBefore: employee.titleBefore,
    name: employee.name,
    surname: employee.surname,
    titleAfter: employee.titleAfter,
    userEmail: employee.email || null,
    userName: employee.userName || null,
    personalNumber: employee.personalNumber || null,
    positionNum: employee.positionNum,
    positionName: employee.positionName,
    department: employee.department,
    unitName: employee.unitName,
    notes: null,
    plannedEnd: null,
    actualEnd: null,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadInternalApp(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění načítat data zaměstnance z EOS.",
      },
      { status: 403 }
    )
  }

  try {
    const personalNumber = req.nextUrl.searchParams
      .get("personalNumber")
      ?.trim()

    if (!personalNumber) {
      return NextResponse.json(
        {
          status: "error",
          message: "Osobní číslo je povinné.",
        },
        { status: 400 }
      )
    }

    const employees = await getEmployees(personalNumber)
    const employee = employees.find(
      (item) => item.personalNumber === personalNumber
    )

    if (!employee) {
      return NextResponse.json(
        {
          status: "error",
          message: "Zaměstnanec nenalezen.",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      status: "success",
      data: employeeToOffboardingData(employee),
      outsideProduction: getSentryEnvironment() !== "production",
    })
  } catch (error) {
    console.error("Chyba při předvyplňování z EOS:", error)

    if (
      error instanceof Error &&
      error.message.includes("EOS hledání selhalo")
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: "EOS služba není dostupná.",
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst data z EOS.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
