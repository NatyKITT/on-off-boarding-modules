import { NextResponse } from "next/server"

import { processAllMailJobs } from "@/lib/cron-jobs"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const r = await processAllMailJobs()
    return NextResponse.json(r)
  } catch (err) {
    console.error("mail-worker error:", err)
    return NextResponse.json(
      { status: "error", message: "Worker selhal." },
      { status: 500 }
    )
  }
}
export const POST = GET
