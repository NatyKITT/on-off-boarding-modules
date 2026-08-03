import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"
import { isLocalHourNow } from "@/lib/cron-schedule"
import { ensureOffboardingCronJobs } from "@/lib/offboarding-cron-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const unauthorizedResponse = requireCronAuthorization(req)

  if (unauthorizedResponse) {
    return unauthorizedResponse
  }

  const force = req.nextUrl.searchParams.get("force") === "true"

  if (!force && !isLocalHourNow(8)) {
    return NextResponse.json({
      status: "skipped",
      message: "Mimo denní okno 8:00 pražského času.",
    })
  }

  try {
    const result = await ensureOffboardingCronJobs(req)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[CRON_OFFBOARDING_NOTIFICATIONS_ERROR]", error)

    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Offboarding notifications cron failed.",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
