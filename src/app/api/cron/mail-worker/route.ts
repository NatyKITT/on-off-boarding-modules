import { NextResponse } from "next/server"
import { Resend } from "resend"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_EMAIL_FROM || ""

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
  kind?: EmailKind
  type?: string

  recipients?: string[]
  to?: string[]
  subject?: string
  content?: string

  employeeName?: string
  position?: string
  department?: string

  daysRemaining?: number
  probationEndDate?: string | Date

  month?: number | string
  year?: number | string
  group?: "planned" | "actual" | string
  onboardings?: EmployeeListItem[]
  offboardings?: EmployeeListItem[]
  allowResendForAlreadySent?: boolean
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, " - ")
    .replace(/<thead[^>]*>/gi, "")
    .replace(/<\/thead>/gi, "")
    .replace(/<tbody[^>]*>/gi, "")
    .replace(/<\/tbody>/gi, "")
    .replace(/<tr[^>]*>/gi, "\n")
    .replace(/<\/tr>/gi, "")
    .replace(/<th[^>]*>/gi, "")
    .replace(/<\/th>/gi, " | ")
    .replace(/<td[^>]*>/gi, "")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const CZECH_MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
]

function getMonthLabel(payload: EmailPayload): string {
  const rawMonth = payload.month
  const yearStr = payload.year ? String(payload.year) : ""

  const monthNum =
    typeof rawMonth === "number"
      ? rawMonth
      : rawMonth != null
        ? Number(rawMonth)
        : NaN

  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
    return [rawMonth, yearStr].filter(Boolean).join(" ")
  }

  const monthName = CZECH_MONTHS[monthNum - 1] ?? String(rawMonth)
  return yearStr ? `${monthName} ${yearStr}` : monthName
}

function formatDateForCs(date?: string | Date | null): string {
  if (!date) return ""
  return new Date(date).toLocaleDateString("cs-CZ")
}

function generateEmailContent(payload: EmailPayload): {
  subject: string
  html: string
  text: string
} {
  const type = (payload.kind || payload.type || "unknown") as EmailKind

  switch (type) {
    case "onboarding": {
      const subject =
        payload.subject || `Informace o nástupu – ${payload.employeeName ?? ""}`

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5;">
          <h2 style="font-size:16px; margin:0 0 8px;">Informace o nástupu zaměstnance</h2>
          <p><strong>Jméno:</strong> ${payload.employeeName ?? "-"}</p>
          <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
          <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
          ${
            payload.content
              ? `<p><strong>Dodatečné informace:</strong> ${payload.content}</p>`
              : ""
          }
          <hr style="margin-top:16px; border:none; border-top:1px solid #ddd;">
          <p style="font-size:11px; color:#555;">Automaticky generováno systémem nástupů a odchodů.</p>
        </div>
      `

      const textLines = [
        "Informace o nástupu zaměstnance",
        `Jméno: ${payload.employeeName ?? "-"}`,
        `Pozice: ${payload.position ?? "-"}`,
        `Odbor: ${payload.department ?? "-"}`,
        payload.content ? `Dodatečné informace: ${payload.content}` : "",
        "",
        "Automaticky generováno systémem nástupů a odchodů.",
      ].filter(Boolean)

      return { subject, html, text: textLines.join("\n") }
    }

    case "probation_warning": {
      const subject =
        payload.subject ||
        `Zkušební doba končí za ${payload.daysRemaining ?? "?"} dní`

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5;">
          <h2 style="font-size:16px; margin:0 0 8px;">Upozornění – končí zkušební doba</h2>
          <p><strong>Zaměstnanec:</strong> ${payload.employeeName ?? "-"}</p>
          <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
          <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
          <p><strong>Zkušební doba končí za:</strong> ${
            payload.daysRemaining ?? "?"
          } dní</p>
          <p><strong>Datum konce:</strong> ${
            payload.probationEndDate
              ? formatDateForCs(payload.probationEndDate)
              : "-"
          }</p>
          <hr style="margin:16px 0 8px; border:none; border-top:1px solid #ddd;">
          <p><strong>Akce k provedení:</strong></p>
          <ul>
            <li>Připravit hodnocení zaměstnance</li>
            <li>Rozhodnout o pokračování pracovního poměru</li>
            <li>Aktualizovat záznamy v systému</li>
          </ul>
        </div>
      `

      const textLines = [
        "Upozornění – končí zkušební doba",
        `Zaměstnanec: ${payload.employeeName ?? "-"}`,
        `Pozice: ${payload.position ?? "-"}`,
        `Odbor: ${payload.department ?? "-"}`,
        `Zkušební doba končí za: ${payload.daysRemaining ?? "?"} dní`,
        `Datum konce: ${
          payload.probationEndDate
            ? formatDateForCs(payload.probationEndDate)
            : "-"
        }`,
        "",
        "Akce k provedení:",
        "- Připravit hodnocení zaměstnance",
        "- Rozhodnout o pokračování pracovního poměru",
        "- Aktualizovat záznamy v systému",
      ]

      return { subject, html, text: textLines.join("\n") }
    }

    case "probation_reminder": {
      const subject =
        payload.subject ||
        `Vaše zkušební doba končí za ${payload.daysRemaining ?? "?"} dní`

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5;">
          <h2 style="font-size:16px; margin:0 0 8px;">Informace o zkušební době</h2>
          <p>Vážený/á ${payload.employeeName ?? ""},</p>
          <p>
            informujeme Vás, že Vaše zkušební doba na pozici
            <strong>${payload.position ?? "-"}</strong> končí za
            <strong>${payload.daysRemaining ?? "?"} dní</strong>.
          </p>
          <p><strong>Datum konce zkušební doby:</strong> ${
            payload.probationEndDate
              ? formatDateForCs(payload.probationEndDate)
              : "-"
          }</p>
          <p>V případě dotazů se obraťte na svého nadřízeného nebo HR oddělení.</p>
          <hr style="margin-top:16px; border:none; border-top:1px solid #ddd;">
          <p>S pozdravem,<br>HR oddělení</p>
        </div>
      `

      const textLines = [
        "Informace o zkušební době",
        `Zaměstnanec: ${payload.employeeName ?? "-"}`,
        `Pozice: ${payload.position ?? "-"}`,
        `Odbor: ${payload.department ?? "-"}`,
        `Zkušební doba končí za: ${payload.daysRemaining ?? "?"} dní`,
        `Datum konce zkušební doby: ${
          payload.probationEndDate
            ? formatDateForCs(payload.probationEndDate)
            : "-"
        }`,
        "",
        "V případě dotazů se obraťte na svého nadřízeného nebo HR oddělení.",
        "",
        "S pozdravem,",
        "HR oddělení",
      ]

      return { subject, html, text: textLines.join("\n") }
    }

    case "monthly_summary": {
      const onboardings = Array.isArray(payload.onboardings)
        ? payload.onboardings
        : []
      const offboardings = Array.isArray(payload.offboardings)
        ? payload.offboardings
        : []

      const monthLabel = getMonthLabel(payload)

      const subject = `Přehled personálních změn – ${monthLabel}`

      const renderTable = (
        items: EmployeeListItem[],
        dateHeader: string
      ): string => {
        if (!items.length) {
          return `<p>Žádné záznamy.</p>`
        }

        const rows = items
          .map((emp) => {
            const dateStr = emp.date ? formatDateForCs(emp.date) : ""
            return `
              <tr>
                <td style="border:1px solid #000; padding:2px 4px;">${emp.name}</td>
                <td style="border:1px solid #000; padding:2px 4px;">${emp.position}</td>
                <td style="border:1px solid #000; padding:2px 4px;">${emp.department}</td>
                <td style="border:1px solid #000; padding:2px 4px;">${dateStr}</td>
              </tr>
            `
          })
          .join("")

        return `
          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:13px; margin:4px 0;">
            <thead>
              <tr>
                <th align="left" style="border:1px solid #000; padding:2px 4px;">Zaměstnanec</th>
                <th align="left" style="border:1px solid #000; padding:2px 4px;">Pozice</th>
                <th align="left" style="border:1px solid #000; padding:2px 4px;">Odbor</th>
                <th align="left" style="border:1px solid #000; padding:2px 4px;">${dateHeader}</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `
      }

      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5;">
          <p style="margin:0 0 4px;"><strong>Personální změny</strong></p>
          <p style="margin:0 0 12px;"><strong>Přehled personálních změn – ${monthLabel}</strong></p>

          <p style="margin:0 0 16px;">
            Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace
            o vzniku a ukončení pracovních poměrů v měsíci ${monthLabel}.
          </p>

          ${
            onboardings.length
              ? `
                <h3 style="font-size:14px; margin:0 0 4px;">Nástupy</h3>
                <p style="margin:0 0 4px;">Seznam zaměstnanců s nástupem v daném měsíci.</p>
                ${renderTable(onboardings, "Datum nástupu")}
              `
              : ""
          }

          <h3 style="font-size:14px; margin:16px 0 4px;">Odchody</h3>
          <p style="margin:0 0 4px;">
            Seznam zaměstnanců s ukončením pracovního poměru v daném měsíci.
          </p>
          ${renderTable(offboardings, "Datum ukončení")}

          ${
            payload.allowResendForAlreadySent
              ? `<p style="margin-top:8px; font-size:11px; color:#555;">
                   Poznámka: některé položky mohly být dříve odeslány, jsou zahrnuty na základě opakovaného požadavku.
                 </p>`
              : ""
          }

          <p style="margin-top:16px; font-size:11px; color:#555;">
            Tento e-mail byl automaticky generován systémem On-Off-Boarding ÚMČ Praha 6.
            Neodpovídejte prosím na tento e-mail – v případě dotazů kontaktujte personální oddělení.
          </p>
        </div>
      `

      const textLines: string[] = [
        "Personální změny",
        `Přehled personálních změn – ${monthLabel}`,
        "",
        `Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace o vzniku a ukončení pracovních poměrů v měsíci ${monthLabel}.`,
        "",
      ]

      if (onboardings.length) {
        textLines.push("Nástupy:")
        onboardings.forEach((emp) => {
          textLines.push(
            ` - ${emp.name} | ${emp.position} | ${emp.department} | ${formatDateForCs(emp.date)}`
          )
        })
        textLines.push("")
      }

      textLines.push("Odchody:")
      if (offboardings.length) {
        offboardings.forEach((emp) => {
          textLines.push(
            ` - ${emp.name} | ${emp.position} | ${emp.department} | ${formatDateForCs(emp.date)}`
          )
        })
      } else {
        textLines.push("Žádné odchody.")
      }

      textLines.push(
        "",
        "Tento e-mail byl automaticky generován systémem On-Off-Boarding ÚMČ Praha 6.",
        "Neodpovídejte prosím na tento e-mail – v případě dotazů kontaktujte personální oddělení."
      )

      return { subject, html, text: textLines.join("\n") }
    }

    case "manual_email": {
      const subject =
        payload.subject || `Ruční e-mail – ${payload.employeeName ?? ""}`

      const html =
        payload.content ||
        `
          <div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5;">
            <h2 style="font-size:16px; margin:0 0 8px;">Ruční e-mail</h2>
            <p><strong>Zaměstnanec:</strong> ${payload.employeeName ?? "-"}</p>
            <p><strong>Pozice:</strong> ${payload.position ?? "-"}</p>
            <p><strong>Odbor:</strong> ${payload.department ?? "-"}</p>
          </div>
        `

      const text =
        payload.content ??
        [
          "Ruční e-mail",
          `Zaměstnanec: ${payload.employeeName ?? "-"}`,
          `Pozice: ${payload.position ?? "-"}`,
          `Odbor: ${payload.department ?? "-"}`,
        ].join("\n")

      return { subject, html, text }
    }

    default: {
      const subject = payload.subject || "Systémová zpráva"
      const html =
        payload.content ||
        `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
      const text = payload.content ?? JSON.stringify(payload, null, 2)

      return { subject, html, text }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

async function sendEmailViaResend(
  payload: EmailPayload
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { subject, html, text } = generateEmailContent(payload)

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
      text: text || htmlToPlainText(html),
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

      const emailResult = await sendEmailViaResend(job.payload as EmailPayload)

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
                ? new Date(Date.now() + Math.pow(2, newRetryCount) * 60_000)
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
            retryCount: job.maxRetries,
          },
        })
        .catch(console.error)

      results.failed++
      results.errors.push(`Job ${job.id}: ${errorMessage}`)
    }
  }

  return results
}

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

export const POST = GET

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
