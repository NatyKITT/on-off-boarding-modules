import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"
import { isLocalHourNow } from "@/lib/cron-schedule"
import { ensureEmploymentDocumentReminders } from "@/lib/employment-document-cron-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

// Automatika k vyhodnocení zkušební doby byla z tohoto endpointu odebrána -
// bude nově řešena přes jinou aplikaci. Šablony e-mailů, formulář vyjádření
// tajemníka a související logika v @/lib/email a @/lib/probation-evaluation-request
// zůstávají beze změny a dál se používají mimo tento cron (např. finální
// odeslání formuláře vedoucím). Tento endpoint teď na stejném denním
// spouštění v 8:00 hlídá jen vypršení odkazů k vyplnění nástupních
// dokumentů (viz @/lib/employment-document-cron-jobs).
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
    const employmentDocumentReminders =
      await ensureEmploymentDocumentReminders(req)

    return NextResponse.json({
      status: "success",
      employmentDocumentReminders,
    })
  } catch (error) {
    console.error("[CRON_PROBATION_NOTIFICATIONS_ERROR]", error)

    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Employment document reminders cron failed.",
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
