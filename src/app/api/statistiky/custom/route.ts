import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { canAccessInternalApp } from "@/lib/rbac"
import { getCustomView } from "@/lib/statistics/aggregate"
import { parseStatisticsFilters } from "@/lib/statistics/parse-filters"
import type { StatDimension, StatMetric } from "@/lib/statistics/types"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const VALID_METRICS: StatMetric[] = [
  "onboardings",
  "offboardings",
  "onboardingsCancelled",
  "offboardingsDuringProbation",
  "changes",
  "documentsCompletion",
  "probationEvaluationCompletion",
]

const VALID_DIMENSIONS: StatDimension[] = [
  "department",
  "unitName",
  "positionName",
  "month",
  "changeType",
  "supervisor",
  "probationLength",
  "positionType",
]

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

  const searchParams = request.nextUrl.searchParams
  const metric = searchParams.get("metric") as StatMetric | null
  const dimension = searchParams.get("dimension") as StatDimension | null

  if (!metric || !VALID_METRICS.includes(metric)) {
    return NextResponse.json(
      { status: "error", message: "Neplatná metrika." },
      { status: 400 }
    )
  }

  if (!dimension || !VALID_DIMENSIONS.includes(dimension)) {
    return NextResponse.json(
      { status: "error", message: "Neplatný rozpad." },
      { status: 400 }
    )
  }

  try {
    const filters = parseStatisticsFilters(searchParams)
    const result = await getCustomView({
      metric,
      dimension,
      filters,
      displayType: "table",
    })

    return NextResponse.json({ status: "success", data: result.data })
  } catch (error) {
    console.error("GET /api/statistiky/custom error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst vlastní pohled." },
      { status: 500 }
    )
  }
}
