import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { canAccessInternalApp } from "@/lib/rbac"
import {
  getStatisticsFilterOptions,
  getStatisticsOverview,
} from "@/lib/statistics/aggregate"
import { parseStatisticsFilters } from "@/lib/statistics/parse-filters"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canAccessInternalApp(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění zobrazit statistiky." },
      { status: 403 }
    )
  }

  try {
    const filters = parseStatisticsFilters(request.nextUrl.searchParams)

    const [overview, filterOptions] = await Promise.all([
      getStatisticsOverview(filters),
      getStatisticsFilterOptions(),
    ])

    return NextResponse.json({
      status: "success",
      data: { ...overview, filterOptions },
    })
  } catch (error) {
    console.error("GET /api/statistiky error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst statistiky." },
      { status: 500 }
    )
  }
}
