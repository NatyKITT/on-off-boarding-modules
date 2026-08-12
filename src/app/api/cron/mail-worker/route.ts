import { NextRequest, NextResponse } from "next/server"

import { requireCronAuthorization } from "@/lib/cron-auth"
import { processMailQueueBatch } from "@/lib/mail-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function getBatchSize() {
  const value = Number(process.env.MAIL_WORKER_BATCH_SIZE ?? 20)

  return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 20
}

async function runMailWorker(req: NextRequest) {
  const unauthorized = requireCronAuthorization(req)

  if (unauthorized) {
    return unauthorized
  }

  try {
    const result = await processMailQueueBatch({ batchSize: getBatchSize() })

    return NextResponse.json({
      status: "success",
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      permanentlyFailed: result.permanentlyFailed,
    })
  } catch (error) {
    console.error("[CRON_MAIL_WORKER_ERROR]", error)

    return NextResponse.json(
      {
        status: "error",
        processed: 0,
        succeeded: 0,
        failed: 0,
        permanentlyFailed: 0,
        message: "Mail worker failed.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return runMailWorker(req)
}

export async function POST(req: NextRequest) {
  return runMailWorker(req)
}
