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
      { status: "error", message: "Nejste přihlášeni." },
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
    const listAll = req.nextUrl.searchParams.get("listAll") === "true"
    const limit = listAll
      ? Number.MAX_SAFE_INTEGER
      : Math.min(
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

    const excludeActiveOffboardings =
      req.nextUrl.searchParams.get("excludeActiveOffboardings") !== "false"

    if (!q && !listAll) {
      return NextResponse.json({ data: [] })
    }

    const activeOffboardings = await prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: null,
        cancelledAt: null,
      },
      select: {
        personalNumber: true,
        actualEnd: true,
      },
    })

    const activeOffboardingStatusByNumber = new Map<
      string,
      "planned" | "actual"
    >()

    for (const offboarding of activeOffboardings) {
      if (!offboarding.personalNumber) continue
      activeOffboardingStatusByNumber.set(
        offboarding.personalNumber,
        offboarding.actualEnd ? "actual" : "planned"
      )
    }

    const hardExcluded = new Set([
      ...manualExclude,
      ...(excludeActiveOffboardings
        ? activeOffboardingStatusByNumber.keys()
        : []),
    ])

    const employees = await getEmployees(listAll ? "" : q)

    const filteredEmployees = employees
      .filter((employee) => !hardExcluded.has(employee.personalNumber))
      .map((employee) => {
        if (excludeActiveOffboardings) return employee

        const status = activeOffboardingStatusByNumber.get(
          employee.personalNumber
        )

        return status
          ? {
              ...employee,
              hasActiveOffboarding: true,
              activeOffboardingStatus: status,
            }
          : employee
      })

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
