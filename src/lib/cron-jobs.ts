import type { MailJobStatus, MailQueue } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getEmailSender } from "@/lib/email"

type EmployeeInfoPayload = {
  kind: "onboarding" | "offboarding"
  id: number
  to: string[]
}

type MonthlySummaryPayload = {
  year: number
  month: number
  extraRecipients?: string[]
}

const ACTIVE_STATUSES: MailJobStatus[] = ["QUEUED", "PROCESSING", "SENT"]

export async function processAllMailJobs(take: number = 50): Promise<{
  processed: number
  sent: number
  failed: number
  skipped: number
}> {
  const now = new Date()
  const jobs = await prisma.mailQueue.findMany({
    where: {
      status: "QUEUED",
      OR: [{ sendAt: null }, { sendAt: { lte: now } }],
    },
    orderBy: { id: "asc" },
    take,
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const job of jobs) {
    try {
      const claim = await prisma.mailQueue.updateMany({
        where: { id: job.id, status: "QUEUED" },
        data: { status: "PROCESSING" },
      })
      if (claim.count === 0) {
        skipped++
        continue
      }

      if (job.type === "EMPLOYEE_INFO") {
        await processEmployeeInfoJob(job)
      } else if (job.type === "MONTHLY_SUMMARY") {
        await processMonthlySummaryJob(job)
      } else {
        await prisma.mailQueue.update({
          where: { id: job.id },
          data: { status: "FAILED", error: "Unknown job type" },
        })
        failed++
        continue
      }

      await prisma.mailQueue.update({
        where: { id: job.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      })
      sent++
    } catch (e) {
      await prisma.mailQueue.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: e instanceof Error ? e.message : "Unknown error",
        },
      })
      failed++
    }
  }

  return { processed: jobs.length, sent, failed, skipped }
}

async function processEmployeeInfoJob(job: MailQueue): Promise<void> {
  const payload = job.payload as unknown as EmployeeInfoPayload
  const { kind, id, to } = payload
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error("Empty recipients")
  }

  const subject =
    kind === "onboarding"
      ? "Informace k nástupu"
      : "Informace k ukončení pracovního poměru"
  const html = `<p>Dobrý den,</p>
    <p>posíláme vám informaci ${
      kind === "onboarding" ? "k nástupu" : "k ukončení"
    }.</p>`

  await getEmailSender().send({ to, subject, html })

  if (kind === "onboarding") {
    await prisma.onboardingChangeLog.create({
      data: {
        employeeId: id,
        userId: job.createdBy ?? "system",
        action: "MAIL_SENT",
        field: "EMPLOYEE_INFO",
        oldValue: null,
        newValue: JSON.stringify({ to }),
      },
    })
  } else {
    await prisma.offboardingChangeLog.create({
      data: {
        employeeId: id,
        userId: job.createdBy ?? "system",
        action: "MAIL_SENT",
        field: "EMPLOYEE_INFO",
        oldValue: null,
        newValue: JSON.stringify({ to }),
      },
    })
  }
}

async function processMonthlySummaryJob(job: MailQueue): Promise<void> {
  const payload = job.payload as unknown as MonthlySummaryPayload
  const { year, month, extraRecipients } = payload

  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0))

  const [onbs, offs] = await Promise.all([
    prisma.employeeOnboarding.findMany({
      where: { deletedAt: null, actualStart: { gte: from, lt: to } },
      orderBy: { actualStart: "asc" },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        actualStart: true,
      },
    }),
    prisma.employeeOffboarding.findMany({
      where: { deletedAt: null, actualEnd: { gte: from, lt: to } },
      orderBy: { actualEnd: "asc" },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        actualEnd: true,
      },
    }),
  ])

  const subject = `Měsíční přehled – ${month}.${year}`
  const html = `
    <h2 style="margin:0 0 12px;">Měsíční přehled – ${month}.${year}</h2>
    <h3 style="margin:16px 0 8px;">Nástupy (${onbs.length})</h3>
    <ul>
      ${onbs
        .map(
          (r) =>
            `<li>${r.titleBefore ?? ""} ${r.name} ${r.surname} ${
              r.titleAfter ?? ""
            } — ${r.positionName} — ${
              r.actualStart
                ? new Date(r.actualStart).toLocaleDateString("cs-CZ")
                : ""
            }</li>`
        )
        .join("")}
    </ul>
    <h3 style="margin:16px 0 8px;">Odchody (${offs.length})</h3>
    <ul>
      ${offs
        .map(
          (r) =>
            `<li>${r.titleBefore ?? ""} ${r.name} ${r.surname} ${
              r.titleAfter ?? ""
            } — ${r.positionName} — ${
              r.actualEnd
                ? new Date(r.actualEnd).toLocaleDateString("cs-CZ")
                : ""
            }</li>`
        )
        .join("")}
    </ul>
  `

  const baseRecipients = (process.env.REPORT_RECIPIENTS_PLANNED ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const allRecipients = Array.from(
    new Set([...(extraRecipients ?? []), ...baseRecipients])
  )
  if (allRecipients.length === 0) {
    throw new Error("Chybí REPORT_RECIPIENTS nebo příjemci.")
  }

  await getEmailSender().send({ to: allRecipients, subject, html })

  await prisma.$transaction([
    prisma.onboardingChangeLog.createMany({
      data: onbs.map((r) => ({
        employeeId: r.id,
        userId: job.createdBy ?? "system",
        action: "MAIL_SENT",
        field: "MONTHLY_SUMMARY",
        oldValue: null,
        newValue: JSON.stringify({ year, month }),
      })),
    }),
    prisma.offboardingChangeLog.createMany({
      data: offs.map((r) => ({
        employeeId: r.id,
        userId: job.createdBy ?? "system",
        action: "MAIL_SENT",
        field: "MONTHLY_SUMMARY",
        oldValue: null,
        newValue: JSON.stringify({ year, month }),
      })),
    }),
  ])
}

export async function existsMonthlyJob(
  year: number,
  month: number
): Promise<boolean> {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      type: "MONTHLY_SUMMARY",
      status: { in: ACTIVE_STATUSES },
    },
    select: { payload: true },
    take: 200,
  })
  for (const j of jobs) {
    const p = j.payload as unknown as { year?: unknown; month?: unknown }
    if (p && p.year === year && p.month === month) return true
  }
  return false
}
