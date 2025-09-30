import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"

const bodySchema = z.object({
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  content: z.string().optional(),
  emailType: z
    .enum(["MANUAL_EMAIL", "PROBATION_REMINDER", "SYSTEM_NOTIFICATION"])
    .default("MANUAL_EMAIL"),
  priority: z.number().min(1).max(10).default(5),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
      {
        status: "error",
        message: "Neplatná data požadavku.",
        errors: parsed.error.errors,
      },
      { status: 400 }
    )
  }

  const { recipients, subject, content, emailType, priority } = parsed.data

  const employee = await prisma.employeeOnboarding.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      surname: true,
      userEmail: true,
      positionName: true,
      department: true,
      deletedAt: true,
    },
  })

  if (!employee) {
    return NextResponse.json(
      { status: "error", message: "Zaměstnanec nenalezen." },
      { status: 404 }
    )
  }

  if (employee.deletedAt) {
    return NextResponse.json(
      { status: "error", message: "Nelze poslat email smazanému záznamu." },
      { status: 409 }
    )
  }

  const createdBy =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  try {
    // Vytvoř email v queue
    const mailJob = await prisma.mailQueue.create({
      data: {
        type: emailType,
        payload: {
          employeeId: employee.id,
          employeeName: `${employee.name} ${employee.surname}`,
          position: employee.positionName,
          department: employee.department,
          recipients,
          subject,
          content:
            content || `Ruční email pro ${employee.name} ${employee.surname}`,
          customEmail: true,
        },
        priority,
        createdBy,
      },
    })

    // Zaznamenej do historie emailů
    const emailHistory = await prisma.emailHistory.create({
      data: {
        mailQueueId: mailJob.id,
        onboardingEmployeeId: employee.id,
        emailType,
        recipients,
        subject,
        content,
        status: "QUEUED",
        createdBy,
      },
    })

    // Zaznamenej do change logu
    await prisma.onboardingChangeLog.create({
      data: {
        employeeId: employee.id,
        userId: createdBy,
        action: "MAIL_SENT",
        field: "manual_email",
        oldValue: null,
        newValue: JSON.stringify({
          mailJobId: mailJob.id,
          emailHistoryId: emailHistory.id,
          recipients,
          subject,
          emailType,
        }),
      },
    })

    return NextResponse.json({
      status: "success",
      message: "Email byl zařazen do fronty k odeslání.",
      data: {
        mailJobId: mailJob.id,
        emailHistoryId: emailHistory.id,
        recipients,
        subject,
        status: "QUEUED",
      },
    })
  } catch (error) {
    console.error("Chyba při vytváření emailu:", error)
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

// GET endpoint pro historii emailů zaměstnance
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  try {
    const emailHistory = await prisma.emailHistory.findMany({
      where: { onboardingEmployeeId: id },
      include: {
        mailQueue: {
          select: {
            id: true,
            type: true,
            status: true,
            sentAt: true,
            error: true,
            priority: true,
            retryCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const employee = await prisma.employeeOnboarding.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        positionName: true,
      },
    })

    return NextResponse.json({
      status: "success",
      data: {
        employee,
        emailHistory,
        summary: {
          total: emailHistory.length,
          sent: emailHistory.filter((e) => e.status === "SENT").length,
          failed: emailHistory.filter((e) => e.status === "FAILED").length,
          queued: emailHistory.filter((e) => e.status === "QUEUED").length,
        },
      },
    })
  } catch (error) {
    console.error("Chyba při načítání historie emailů:", error)
    return NextResponse.json(
      { status: "error", message: "Chyba při načítání historie." },
      { status: 500 }
    )
  }
}
