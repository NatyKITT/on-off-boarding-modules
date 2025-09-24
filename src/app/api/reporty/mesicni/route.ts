import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { existsMonthlyJob } from "@/lib/cron-jobs"
import { prisma } from "@/lib/db"

const bodySchema = z.object({
  extraRecipients: z.array(z.string().email()).optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )

  const url = new URL(req.url)
  const year = Number(url.searchParams.get("year"))
  const month = Number(url.searchParams.get("month"))
  const force = url.searchParams.get("force") === "1"

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Neplatné parametry." },
      { status: 400 }
    )
  }
  const extraRecipients = parsed.data.extraRecipients

  const already = await existsMonthlyJob(year, month)
  if (already && !force) {
    return NextResponse.json(
      {
        status: "already",
        already: true,
        message:
          "Souhrn pro tento měsíc už byl dříve zařazen/odeslán. Odeslat znovu?",
      },
      { status: 409 }
    )
  }

  const userId =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  await prisma.mailQueue.create({
    data: {
      type: "MONTHLY_SUMMARY",
      payload: { year, month, extraRecipients },
      status: "QUEUED",
      createdBy: userId,
      sendAt: new Date(), // ihned
    },
  })

  return NextResponse.json({
    status: "success",
    message: "Souhrn zařazen k odeslání.",
  })
}
