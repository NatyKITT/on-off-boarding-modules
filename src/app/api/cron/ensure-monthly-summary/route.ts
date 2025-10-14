import { NextResponse } from "next/server"

import { existsMonthlyJob } from "@/lib/cron-jobs"
import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST() {
  try {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth() + 1

    const prevYear = m === 1 ? y - 1 : y
    const prevMonth = m === 1 ? 12 : m - 1

    const already = await existsMonthlyJob(prevYear, prevMonth)
    if (!already) {
      const sendAt = new Date(Date.UTC(y, m - 1, 1, 8, 0, 0)) // 1. den 08:00 UTC
      await prisma.mailQueue.create({
        data: {
          type: "MONTHLY_SUMMARY",
          payload: { year: prevYear, month: prevMonth },
          sendAt,
          status: "QUEUED",
          createdBy: "cron",
        },
      })
    }

    return NextResponse.json({ status: "success", ensured: !already })
  } catch (err) {
    console.error("ensure-monthly-summary error:", err)
    return NextResponse.json(
      { status: "error", message: "Nelze zajistit měsíční souhrn." },
      { status: 500 }
    )
  }
}
