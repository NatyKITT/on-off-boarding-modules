import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { processAllMailJobs } from "@/lib/cron-jobs"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const bodySchema = z.object({ email: z.string().email().optional() })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )

  const id = Number(params.id)
  if (!Number.isFinite(id))
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success)
    return NextResponse.json(
      { status: "error", message: "Neplatná data požadavku." },
      { status: 400 }
    )
  const overrideEmail = parsed.data.email

  const rec = await prisma.employeeOnboarding.findUnique({ where: { id } })
  if (!rec)
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )

  const recipients = Array.from(
    new Set(
      [
        overrideEmail,
        rec.userEmail ?? undefined,
        rec.email ?? undefined,
      ].filter(Boolean) as string[]
    )
  )
  if (recipients.length === 0)
    return NextResponse.json(
      { status: "error", message: "U záznamu chybí e-mail. Upravte formulář." },
      { status: 409 }
    )

  const createdBy =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  await prisma.$transaction([
    prisma.mailQueue.create({
      data: {
        type: "EMPLOYEE_INFO",
        payload: { kind: "onboarding", id: rec.id, to: recipients },
        status: "QUEUED",
        createdBy,
      },
    }),
    prisma.onboardingChangeLog.create({
      data: {
        employeeId: rec.id,
        userId: createdBy,
        action: "MAIL_ENQUEUED",
        field: "EMPLOYEE_INFO",
        oldValue: null,
        newValue: JSON.stringify({ to: recipients }),
      },
    }),
  ])

  await processAllMailJobs(5)

  return NextResponse.json({
    status: "success",
    message: "E-mail odeslán / fronta zpracována.",
  })
}
