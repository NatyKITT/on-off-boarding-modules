import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(req: NextRequest) {
  const unauthorized = requireCronAuthorization(req)

  if (unauthorized) {
    return unauthorized
  }

  return NextResponse.json({
    status: "disabled",
    message:
      "Použijte /api/cron/probation-notifications pro vytvoření jobů a /api/cron/mail-worker pro odeslání fronty.",
  })
}
