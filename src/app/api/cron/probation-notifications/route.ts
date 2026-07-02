import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"
import { ensureProbationCronJobs } from "@/lib/probation-cron-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const unauthorizedResponse = requireCronAuthorization(req)

  if (unauthorizedResponse) {
    return unauthorizedResponse
  }

  try {
    const result = await ensureProbationCronJobs(req)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[CRON_PROBATION_NOTIFICATIONS_ERROR]", error)

    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Probation notifications cron failed.",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
