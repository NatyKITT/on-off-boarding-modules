// app/api/cron/mail-worker/route.ts
import { NextResponse } from "next/server"
import { Resend } from "resend"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "system@company.com"

/* ----------------------------- Typy ------------------------------ */
type EmployeeListItem = {
  name: string
  position: string
  department: string
  date?: string | Date | null
}

type EmailKind =
  | "onboarding"
  | "probation_warning"
  | "probation_reminder"
  | "monthly_summary"
  | "manual_email"
  | "unknown"
  | string

type EmailPayload = {
  // identifikace / směrování
  kind?: EmailKind
  type?: string

  // metadata a obsah
  recipients?: string[]
  to?: string[]
  subject?: string
  content?: string

  // běžná pole napříč šablonami
  employeeName?: string
  position?: string
  department?: string

  // probation*
  daysRemaining?: number
  probationEndDate?: string | Date

  // monthly summary
  month?: number | string
  year?: number | string
  group?: "planned" | "actual" | string
  onboardings?: EmployeeListItem[]
  offboardings?: EmployeeListItem[]
  allowResendForAlreadySent?: boolean
}

/* -------------------------- Šablony e-mailů ----------------------- */
function generateEmailHTML(payload: EmailPayload): {
  subject: string
  html: string
} {
  const type = (payload.kind || payload.type || "unknown") as EmailKind

  switch (type) {
    case "onboarding": {
      const subject =
        payload.subject || `Informace o nástupu - ${payload.employeeName ?? ""}`

      const html = `
        <h2>Informace o nástupu zaměstnance</h2>
        <p><strong>Jméno:</strong> ${payload.employeeName ?? "-"}</p>
        <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
        <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
        ${payload.content ? `<div><h3>Dodatečné informace:</h3><p>${payload.content}</p></div>` : ""}
        <hr>
        <p><small>Automaticky generován systémem nástupů a odchodů</small></p>
      `
      return { subject, html }
    }

    case "probation_warning": {
      const subject =
        payload.subject ||
        `Zkušební doba končí za ${payload.daysRemaining ?? "?"} dní`
      const html = `
        <h2>🚨 Upozornění - Končí zkušební doba</h2>
        <p><strong>Zaměstnanec:</strong> ${payload.employeeName ?? "-"}</p>
        <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
        <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
        <p><strong>Zkušební doba končí za:</strong> ${payload.daysRemaining ?? "?"} dní</p>
        <p><strong>Datum konce:</strong> ${
          payload.probationEndDate
            ? new Date(payload.probationEndDate).toLocaleDateString("cs-CZ")
            : "-"
        }</p>
        <hr>
        <p><strong>Akce k provedení:</strong></p>
        <ul>
          <li>Připravit hodnocení zaměstnance</li>
          <li>Rozhodnout o pokračování pracovního poměru</li>
          <li>Aktualizovat záznamy v systému</li>
        </ul>
      `
      return { subject, html }
    }

    case "probation_reminder": {
      const subject =
        payload.subject ||
        `Vaše zkušební doba končí za ${payload.daysRemaining ?? "?"} dní`
      const html = `
        <h2>Informace o zkušební době</h2>
        <p>Vážený/á ${payload.employeeName ?? ""},</p>
        <p>informujeme Vás, že Vaše zkušební doba na pozici <strong>${
          payload.position ?? "-"
        }</strong> končí za <strong>${payload.daysRemaining ?? "?"} dní</strong>.</p>
        <p><strong>Datum konce zkušební doby:</strong> ${
          payload.probationEndDate
            ? new Date(payload.probationEndDate).toLocaleDateString("cs-CZ")
            : "-"
        }</p>
        <p>V případě dotazů se obraťte na svého nadřízeného nebo HR oddělení.</p>
        <hr>
        <p>S pozdravem,<br>HR oddělení</p>
      `
      return { subject, html }
    }

    case "monthly_summary": {
      const onboardings = Array.isArray(payload.onboardings)
        ? payload.onboardings
        : []
      const offboardings = Array.isArray(payload.offboardings)
        ? payload.offboardings
        : []

      const subject =
        payload.subject ||
        `Měsíční přehled ${String(payload.month ?? "")}/${String(payload.year ?? "")}`

      const listToHtml = (items: EmployeeListItem[]) =>
        items
          .map((emp) => {
            const dateStr = emp.date
              ? ` (${new Date(emp.date).toLocaleDateString("cs-CZ")})`
              : ""
            return `<li><strong>${emp.name}</strong> - ${emp.position} - ${emp.department}${dateStr}</li>`
          })
          .join("")

      const html = `
        <h2>Měsíční přehled ${payload.group === "planned" ? "(plánované)" : "(skutečné)"}</h2>
        <p><strong>Období:</strong> ${String(payload.month ?? "")}/${String(payload.year ?? "")}</p>

        <h3>Nástupy (${onboardings.length})</h3>
        ${
          onboardings.length > 0
            ? `<ul>${listToHtml(onboardings)}</ul>`
            : "<p>Žádné nástupy</p>"
        }

        <h3>Odchody (${offboardings.length})</h3>
        ${
          offboardings.length > 0
            ? `<ul>${listToHtml(offboardings)}</ul>`
            : "<p>Žádné odchody</p>"
        }

        ${
          payload.allowResendForAlreadySent
            ? "<p><em>Poznámka: Některé položky již dříve odeslány - zahrnuto na žádost.</em></p>"
            : ""
        }
      `
      return { subject, html }
    }

    case "manual_email": {
      const subject =
        payload.subject || `Ruční email - ${payload.employeeName ?? ""}`
      const html =
        payload.content ||
        `
          <h2>Ruční email</h2>
          <p><strong>Zaměstnanec:</strong> ${payload.employeeName ?? "-"}</p>
          <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
          <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
        `
      return { subject, html }
    }

    default: {
      const subject = payload.subject || "Systémová zpráva"
      const html =
        payload.content ||
        `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
      return { subject, html }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/* -------------------------- Odeslání e-mailu ---------------------- */
async function sendEmailViaResend(
  payload: EmailPayload
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { subject, html } = generateEmailHTML(payload)
    const recipientsCandidate = Array.isArray(payload.recipients)
      ? payload.recipients
      : Array.isArray(payload.to)
        ? payload.to
        : []

    const recipients = recipientsCandidate.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    )

    if (recipients.length === 0) {
      return { success: false, error: "Žádní příjemci" }
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html,
      tags: [
        {
          name: "type",
          value: String(payload.kind || payload.type || "unknown"),
        },
        { name: "source", value: "hr-system" },
      ],
    })

    if (result.error) {
      return { success: false, error: result.error.message }
    }

    return {
      success: true,
      messageId: result.data?.id,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/* ----------------------- Zpracování fronty ------------------------ */
async function processMailJobs(limit: number = 10) {
  const jobs = await prisma.mailQueue.findMany({
    where: {
      status: "QUEUED",
      sendAt: { lte: new Date() },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: limit,
  })

  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as string[],
  }

  for (const job of jobs) {
    results.processed++

    try {
      await prisma.mailQueue.update({
        where: { id: job.id },
        data: { status: "PROCESSING" },
      })

      const emailResult = await sendEmailViaResend(
        job.payload as EmailPayload // payload pochází z DB (Json), typově ho zúžíme
      )

      if (emailResult.success) {
        await prisma.$transaction(async (tx) => {
          await tx.mailQueue.update({
            where: { id: job.id },
            data: {
              status: "SENT",
              sentAt: new Date(),
              error: null,
            },
          })

          const emailHistory = await tx.emailHistory.findFirst({
            where: { mailQueueId: job.id },
          })

          if (emailHistory) {
            await tx.emailHistory.update({
              where: { id: emailHistory.id },
              data: {
                status: "SENT",
                sentAt: new Date(),
                error: null,
              },
            })
          }
        })

        results.succeeded++
        if (emailResult.messageId) {
          console.log(`✅ Email odeslaný: ${emailResult.messageId}`)
        }
      } else {
        const newRetryCount = job.retryCount + 1
        const shouldRetry = newRetryCount < job.maxRetries

        await prisma.$transaction(async (tx) => {
          await tx.mailQueue.update({
            where: { id: job.id },
            data: {
              status: shouldRetry ? "QUEUED" : "FAILED",
              retryCount: newRetryCount,
              error: emailResult.error || "Unknown error",
              sendAt: shouldRetry
                ? new Date(Date.now() + Math.pow(2, newRetryCount) * 60_000) // exponential backoff (minuty)
                : undefined,
            },
          })

          const emailHistory = await tx.emailHistory.findFirst({
            where: { mailQueueId: job.id },
          })

          if (emailHistory) {
            await tx.emailHistory.update({
              where: { id: emailHistory.id },
              data: {
                status: shouldRetry ? "QUEUED" : "FAILED",
                error: emailResult.error || "Unknown error",
              },
            })
          }
        })

        if (!shouldRetry) {
          results.failed++
          results.errors.push(
            `Job ${job.id}: ${emailResult.error ?? "Unknown error"}`
          )
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown processing error"

      await prisma.mailQueue
        .update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: errorMessage,
            retryCount: job.maxRetries, // už nezkoušíme znovu
          },
        })
        .catch(console.error)

      results.failed++
      results.errors.push(`Job ${job.id}: ${errorMessage}`)
    }
  }

  return results
}

/* ------------------------------ Handlery -------------------------- */
export async function GET() {
  try {
    const results = await processMailJobs(10)
    return NextResponse.json({
      status: "success",
      message: `Zpracováno ${results.processed} emailových jobů`,
      ...results,
    })
  } catch (err) {
    console.error("Mail worker error:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Mail worker selhal.",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// Spustitelné i POSTem
export const POST = GET

// Statistika fronty
export async function PUT() {
  try {
    const [stats, recentJobs] = await Promise.all([
      prisma.mailQueue.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.mailQueue.findMany({
        select: {
          id: true,
          type: true,
          status: true,
          sendAt: true,
          sentAt: true,
          error: true,
          retryCount: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ])

    const queueStats = stats.reduce<Record<string, number>>((acc, stat) => {
      acc[stat.status] = stat._count.id
      return acc
    }, {})

    return NextResponse.json({
      status: "success",
      queueStats,
      recentJobs,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: "Chyba při načítání statistik." },
      { status: 500 }
    )
  }
}
