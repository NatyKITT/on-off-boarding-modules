import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { processAllMailJobs } from "@/lib/cron-jobs"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )

  const url = new URL(req.url)
  const year = Number(url.searchParams.get("year"))
  const month = Number(url.searchParams.get("month")) // 1..12
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { status: "error", message: "Neplatný rok/měsíc." },
      { status: 400 }
    )
  }

  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))

  const existing = await prisma.mailQueue.findMany({
    where: { type: "MONTHLY_SUMMARY" },
    select: { payload: true },
  })
  const already = existing.some((j) => {
    const p = j.payload as unknown as { year?: number; month?: number }
    return p?.year === year && p?.month === month
  })
  if (already) {
    await processAllMailJobs(10)
    return NextResponse.json({
      status: "success",
      message: "Souhrn pro tento měsíc už byl zařazen/odeslán.",
    })
  }

  const [onb, off] = await Promise.all([
    prisma.employeeOnboarding.findMany({
      where: { deletedAt: null, actualStart: { gte: from, lt: to } },
      select: { id: true },
    }),
    prisma.employeeOffboarding.findMany({
      where: { deletedAt: null, actualEnd: { gte: from, lt: to } },
      select: { id: true },
    }),
  ])

  const userId =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  await prisma.mailQueue.create({
    data: {
      type: "MONTHLY_SUMMARY",
      payload: {
        year,
        month,
        onboardings: onb.map((r) => r.id),
        offboardings: off.map((r) => r.id),
      },
      status: "QUEUED",
      createdBy: userId,
    },
  })

  await processAllMailJobs(10)

  return NextResponse.json({
    status: "success",
    message: "Měsíční souhrn odeslán / fronta zpracována.",
  })
}
