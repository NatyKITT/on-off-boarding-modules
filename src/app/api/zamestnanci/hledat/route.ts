import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 200), 1),
      1000
    )

    const excludeParam = searchParams.get("exclude") || ""
    const manualExclude = excludeParam
      ? excludeParam
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      : []

    if (!q) return NextResponse.json({ data: [] })

    const activeOffboardings = await prisma.employeeOffboarding.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        personalNumber: true,
      },
    })

    const excludeFromDB = activeOffboardings
      .map((o) => o.personalNumber)
      .filter(Boolean) as string[]

    const allExcluded = [...new Set([...excludeFromDB, ...manualExclude])]

    const employees = await getEmployees(q)

    const filteredEmployees =
      allExcluded.length > 0
        ? employees.filter((emp) => !allExcluded.includes(emp.personalNumber))
        : employees

    return NextResponse.json({ data: filteredEmployees.slice(0, limit) })
  } catch (error) {
    console.error("GET /api/zamestnanci/hledat error:", error)
    return NextResponse.json({ error: "Vyhledávání selhalo." }, { status: 500 })
  }
}
