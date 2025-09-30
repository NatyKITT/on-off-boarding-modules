import { NextRequest, NextResponse } from "next/server"

import { getEmployees, type Employee } from "@/lib/eos-employees"

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
  try {
    const { searchParams } = new URL(req.url)
    const personalNumber = searchParams.get("personalNumber")
    if (!personalNumber) {
      return NextResponse.json(
        { error: "Osobní číslo je povinné." },
        { status: 400 }
      )
    }

    const employees = await getEmployees(personalNumber)
    const employee = employees.find((e) => e.personalNumber === personalNumber)
    if (!employee) {
      return NextResponse.json(
        { error: "Zaměstnanec nenalezen." },
        { status: 404 }
      )
    }

    return NextResponse.json({
      status: "success",
      data: employeeToOffboardingData(employee),
    })
  } catch (error) {
    console.error("Chyba při předvyplňování z EOS:", error)
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
      { error: "Nepodařilo se načíst data z EOS." },
      { status: 500 }
    )
  }
}
