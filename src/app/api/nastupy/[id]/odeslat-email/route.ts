import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const bodySchema = z.object({
  email: z.string().email().optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
})

type RouteParams = { params: { id: string } }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Neplatná data požadavku." },
      { status: 400 }
    )
  }

  const {
    email: overrideEmail,
    subject: customSubject,
    content: customContent,
  } = parsed.data

  const rec = await prisma.employeeOnboarding.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      surname: true,
      email: true,
      positionName: true,
      department: true,
      deletedAt: true,
      personalNumber: true,
      positionNum: true,
    },
  })

  if (!rec) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }

  if (rec.deletedAt) {
    return NextResponse.json(
      { status: "error", message: "Nelze poslat email smazanému záznamu." },
      { status: 409 }
    )
  }

  const recipients = Array.from(
    new Set([overrideEmail, rec.email ?? undefined].filter(Boolean) as string[])
  )

  if (recipients.length === 0) {
    return NextResponse.json(
      { status: "error", message: "U záznamu chybí e-mail. Upravte formulář." },
      { status: 409 }
    )
  }

  const createdBy =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  const defaultSubject = `Informace o nástupu - ${rec.name} ${rec.surname}`
  const defaultContent = `Automaticky generovaný email pro zaměstnance ${rec.name} ${rec.surname} na pozici ${rec.positionName} v odboru ${rec.department}.`

  try {
    const mailJob = await prisma.mailQueue.create({
      data: {
        type: "EMPLOYEE_INFO",
        payload: {
          kind: "onboarding",
          id: rec.id,
          to: recipients,
          employeeName: `${rec.name} ${rec.surname}`,
          position: rec.positionName,
          department: rec.department,
          personalNumber: rec.personalNumber ?? null,
          positionNum: rec.positionNum ?? null,
          subject: customSubject || defaultSubject,
          content: customContent || defaultContent,
          isCustom: Boolean(customSubject || customContent),
        },
        status: "QUEUED",
        createdBy,
        priority: 5,
      },
    })

    const emailHistory = await prisma.emailHistory.create({
      data: {
        mailQueueId: mailJob.id,
        onboardingEmployeeId: rec.id,
        emailType: "EMPLOYEE_INFO",
        recipients,
        subject: customSubject || defaultSubject,
        content: customContent || defaultContent,
        status: "QUEUED",
        createdBy,
      },
    })

    await prisma.onboardingChangeLog.create({
      data: {
        employeeId: rec.id,
        userId: createdBy,
        action: "MAIL_ENQUEUED",
        field: "EMPLOYEE_INFO",
        oldValue: null,
        newValue: JSON.stringify({
          to: recipients,
          mailJobId: mailJob.id,
          emailHistoryId: emailHistory.id,
          subject: customSubject || defaultSubject,
        }),
      },
    })

    return NextResponse.json({
      status: "success",
      message: "E-mail byl zařazen do fronty k odeslání.",
      data: {
        mailJobId: mailJob.id,
        recipients,
      },
    })
  } catch (error) {
    console.error("Chyba při vytváření emailu (offboarding):", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při vytváření emailu.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
