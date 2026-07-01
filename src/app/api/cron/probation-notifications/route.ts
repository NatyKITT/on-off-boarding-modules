import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"
import { ensureProbationCronJobs } from "@/lib/probation-cron-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuthorization(req)

  if (unauthorized) {
    return unauthorized
  }

  try {
    const result = await ensureProbationCronJobs(req)

    return NextResponse.json({
      status: "success",
      ...result,
    })
  } catch (error) {
    console.error("[CRON PROBATION NOTIFICATIONS]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Probation notifications failed.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
