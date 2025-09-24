import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { recipientsFor, sendMail } from "@/lib/email"

const bodySchema = z.object({
  year: z.number().int().min(2000).max(3000),
  month: z.number().int().min(1).max(12),
  group: z.enum(["planned", "actual"]),
  includeOnbIds: z.array(z.number().int()).default([]),
  includeOffIds: z.array(z.number().int()).default([]),
  allowResendForAlreadySent: z.boolean().default(false),
})

export async function POST(req: NextRequest) {
  try {
    const {
      year,
      month,
      group,
      includeOnbIds,
      includeOffIds,
      allowResendForAlreadySent,
    } = bodySchema.parse(await req.json())

    const [onbs, offs] = await Promise.all([
      includeOnbIds.length
        ? prisma.employeeOnboarding.findMany({
            where: { id: { in: includeOnbIds }, deletedAt: null },
            orderBy: { actualStart: "asc" },
          })
        : Promise.resolve([] as const),
      includeOffIds.length
        ? prisma.employeeOffboarding.findMany({
            where: { id: { in: includeOffIds }, deletedAt: null },
            orderBy: { actualEnd: "asc" },
          })
        : Promise.resolve([] as const),
    ])

    // už dříve odeslané (kvůli varování/skipu)
    const [sentOnb, sentOff] = await Promise.all([
      prisma.onboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT",
          //  field: "MONTHLY_SUMMARY", // necháš-li pole, tak i přidej do modelu/seedů
          employeeId: { in: includeOnbIds },
        },
        select: { employeeId: true },
      }),
      prisma.offboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT",
          //  field: "MONTHLY_SUMMARY",
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

    // email
    const subject = `Měsíční přehled – ${month}.${year}${group === "planned" ? " (předpoklady)" : ""}`
    const to = recipientsFor(group)
    const fmt = (d?: Date | null) =>
      d ? new Date(d).toLocaleDateString("cs-CZ") : ""

    const html = `
      <h2 style="margin:0 0 12px 0">${subject}</h2>
      <h3 style="margin:16px 0 8px 0">Nástupy (${filteredOnb.length})</h3>
      <ul style="margin:0 0 16px 18px">
        ${filteredOnb
          .map(
            (r) =>
              `<li>${r.titleBefore ?? ""} ${r.name} ${r.surname} ${r.titleAfter ?? ""} — ${r.positionName} — ${
                group === "planned" ? fmt(r.plannedStart) : fmt(r.actualStart)
              }</li>`
          )
          .join("")}
      </ul>
      <h3 style="margin:16px 0 8px 0">Odchody (${filteredOff.length})</h3>
      <ul style="margin:0 0 16px 18px">
        ${filteredOff
          .map(
            (r) =>
              `<li>${r.titleBefore ?? ""} ${r.name} ${r.surname} ${r.titleAfter ?? ""} — ${r.positionName} — ${
                group === "planned" ? fmt(r.plannedEnd) : fmt(r.actualEnd)
              }</li>`
          )
          .join("")}
      </ul>
      ${
        allowResendForAlreadySent
          ? `<p style="color:#777;margin:8px 0 0 0">Pozn.: některé položky již dříve odeslány – zahrnuto na žádost.</p>`
          : ""
      }
    `

    await sendMail({ to, subject, html })

    // Zápis do changelogů – bez NOOP, čistě callback verze
    await prisma.$transaction(async (tx) => {
      if (filteredOnb.length) {
        await tx.onboardingChangeLog.createMany({
          data: filteredOnb.map((r) => ({
            employeeId: r.id,
            userId: "system",
            action: "MAIL_SENT",
            field: "MONTHLY_SUMMARY",
            oldValue: null,
            newValue: JSON.stringify({ year, month, group }),
          })),
        })
      }
      if (filteredOff.length) {
        await tx.offboardingChangeLog.createMany({
          data: filteredOff.map((r) => ({
            employeeId: r.id,
            userId: "system",
            action: "MAIL_SENT",
            field: "MONTHLY_SUMMARY",
            oldValue: null,
            newValue: JSON.stringify({ year, month, group }),
          })),
        })
      }
    })

    return NextResponse.json({
      status: "success",
      sent: {
        onboardings: filteredOnb.length,
        offboardings: filteredOff.length,
      },
      skipped: {
        onboardings: onbs.length - filteredOnb.length,
        offboardings: offs.length - filteredOff.length,
      },
    })
  } catch (e) {
    console.error("POST /api/reporty/mesicni/odeslat-vyber error:", e)
    return NextResponse.json(
      { status: "error", message: "Odeslání selhalo." },
      { status: 500 }
    )
  }
}
