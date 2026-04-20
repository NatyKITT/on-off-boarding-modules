import { NextRequest, NextResponse } from "next/server"

import { processMailQueueBatch } from "@/lib/mail-queue"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const expected = `Bearer ${process.env.CRON_SECRET}`
  return Boolean(process.env.CRON_SECRET) && authHeader === expected
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await processMailQueueBatch({ batchSize: 20 })

    return NextResponse.json({
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    })
  } catch (error) {
    console.error("Mail worker error:", error)

    return NextResponse.json(
      {
        processed: 0,
        succeeded: 0,
        failed: 0,
        message: "Mail worker failed",
      },
      { status: 500 }
    )
  }
}
