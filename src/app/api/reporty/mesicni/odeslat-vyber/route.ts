import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const bodySchema = z.object({
  year: z.number().int().min(2000).max(3000),
  month: z.number().int().min(1).max(12),
  group: z.enum(["planned", "actual"]),
  includeOnbIds: z.array(z.number().int()).default([]),
  includeOffIds: z.array(z.number().int()).default([]),
  allowResendForAlreadySent: z.boolean().default(false),
  customRecipients: z.array(z.string().email()).optional(), // Nové pole
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  try {
    const {
      year,
      month,
      group,
      includeOnbIds,
      includeOffIds,
      allowResendForAlreadySent,
      customRecipients,
    } = bodySchema.parse(await req.json())

    const [onbs, offs] = await Promise.all([
      includeOnbIds.length
        ? prisma.employeeOnboarding.findMany({
            where: {
              id: { in: includeOnbIds },
              deletedAt: null,
            },
            orderBy: { actualStart: "asc" },
          })
        : Promise.resolve([]),
      includeOffIds.length
        ? prisma.employeeOffboarding.findMany({
            where: {
              id: { in: includeOffIds },
              deletedAt: null,
            },
            orderBy: { actualEnd: "asc" },
          })
        : Promise.resolve([]),
    ])

    const [sentOnb, sentOff] = await Promise.all([
      prisma.onboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT",
          field: "MONTHLY_SUMMARY",
          employeeId: { in: includeOnbIds },
        },
        select: { employeeId: true },
      }),
      prisma.offboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT",
          field: "MONTHLY_SUMMARY",
          employeeId: { in: includeOffIds },
        },
        select: { employeeId: true },
      }),
    ])

    const sentOnbIds = new Set(sentOnb.map((r) => r.employeeId))
    const sentOffIds = new Set(sentOff.map((r) => r.employeeId))

    const filteredOnb = onbs.filter(
      (r) => allowResendForAlreadySent || !sentOnbIds.has(r.id)
    )
    const filteredOff = offs.filter(
      (r) => allowResendForAlreadySent || !sentOffIds.has(r.id)
    )

    if (filteredOnb.length === 0 && filteredOff.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "Žádní kandidáti k odeslání (všichni už mají report odeslán).",
        sent: { onboardings: 0, offboardings: 0 },
        skipped: { onboardings: onbs.length, offboardings: offs.length },
      })
    }

    const createdBy =
      (session.user as { id?: string; email?: string }).id ??
      session.user.email ??
      "unknown"

    const subject = `Měsíční přehled – ${month}/${year}${group === "planned" ? " (plánované)" : " (skutečné)"}`

    const defaultRecipients = ["hr@company.com"] // TODO: konfigurovatelné
    const recipients =
      customRecipients && customRecipients.length > 0
        ? customRecipients
        : defaultRecipients

    const mailJob = await prisma.mailQueue.create({
      data: {
        type: "MONTHLY_SUMMARY",
        payload: {
          year,
          month,
          group,
          onboardings: filteredOnb.map((emp) => ({
            id: emp.id,
            name: `${emp.titleBefore || ""} ${emp.name} ${emp.surname} ${emp.titleAfter || ""}`.trim(),
            position: emp.positionName,
            department: emp.department,
            date:
              group === "planned"
                ? emp.plannedStart?.toISOString()
                : emp.actualStart?.toISOString(),
          })),
          offboardings: filteredOff.map((emp) => ({
            id: emp.id,
            name: `${emp.titleBefore || ""} ${emp.name} ${emp.surname} ${emp.titleAfter || ""}`.trim(),
            position: emp.positionName,
            department: emp.department,
            date:
              group === "planned"
                ? emp.plannedEnd?.toISOString()
                : emp.actualEnd?.toISOString(),
          })),
          recipients,
          subject,
          allowResendForAlreadySent,
        },
        priority: 4,
        createdBy,
      },
    })

    await prisma.emailHistory.create({
      data: {
        mailQueueId: mailJob.id,
        emailType: "MONTHLY_SUMMARY",
        recipients,
        subject,
        content: `Měsíční report obsahuje ${filteredOnb.length} nástupů a ${filteredOff.length} odchodů`,
        status: "QUEUED",
        createdBy,
      },
    })

    await prisma.$transaction(async (tx) => {
      if (filteredOnb.length) {
        await tx.onboardingChangeLog.createMany({
          data: filteredOnb.map((r) => ({
            employeeId: r.id,
            userId: createdBy,
            action: "MAIL_SENT", // ActionType enum
            field: "MONTHLY_SUMMARY",
            oldValue: null,
            newValue: JSON.stringify({
              year,
              month,
              group,
              mailJobId: mailJob.id,
              recipients: recipients.length,
            }),
          })),
        })
      }
      if (filteredOff.length) {
        await tx.offboardingChangeLog.createMany({
          data: filteredOff.map((r) => ({
            employeeId: r.id,
            userId: createdBy,
            action: "MAIL_SENT", // ActionType enum
            field: "MONTHLY_SUMMARY",
            oldValue: null,
            newValue: JSON.stringify({
              year,
              month,
              group,
              mailJobId: mailJob.id,
              recipients: recipients.length,
            }),
          })),
        })
      }
    })

    return NextResponse.json({
      status: "success",
      message: "Měsíční report byl zařazen do fronty k odeslání.",
      sent: {
        onboardings: filteredOnb.length,
        offboardings: filteredOff.length,
      },
      skipped: {
        onboardings: onbs.length - filteredOnb.length,
        offboardings: offs.length - filteredOff.length,
      },
      mailJobId: mailJob.id,
      recipients,
    })
  } catch (e) {
    console.error("POST /api/reporty/mesicni/odeslat-vyber error:", e)
    return NextResponse.json(
      {
        status: "error",
        message: "Odeslání selhalo.",
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
