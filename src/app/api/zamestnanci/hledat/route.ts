import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
import { canReadInternalApp } from "@/lib/rbac"
import { getSentryEnvironment } from "@/lib/sentry-environment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

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
        message: "Nemáte oprávnění vyhledávat zaměstnance.",
      },
      { status: 403 }
    )
  }

  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim()
    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit") || 200), 1),
      1000
    )

    const excludeParam = req.nextUrl.searchParams.get("exclude") || ""
    const manualExclude = excludeParam
      ? excludeParam
          .split(",")
          .map((number) => number.trim())
          .filter(Boolean)
      : []

    if (!q) {
      return NextResponse.json({ data: [] })
    }

    const activeOffboardings = await prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        personalNumber: true,
      },
    })

    const excludeFromDB = activeOffboardings
      .map((offboarding) => offboarding.personalNumber)
      .filter(Boolean) as string[]

    const allExcluded = [...new Set([...excludeFromDB, ...manualExclude])]

    const employees = await getEmployees(q)

    const filteredEmployees =
      allExcluded.length > 0
        ? employees.filter(
            (employee) => !allExcluded.includes(employee.personalNumber)
          )
        : employees

    return NextResponse.json({
      data: filteredEmployees.slice(0, limit),
      outsideProduction: getSentryEnvironment() !== "production",
    })
  } catch (error) {
    console.error("GET /api/zamestnanci/hledat error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Vyhledávání zaměstnanců selhalo.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
