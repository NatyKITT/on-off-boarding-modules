import type { MailJobStatus, MailJobType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Resend } from "resend"

import { prisma } from "@/lib/db"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

function buildFromAddress(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed
  }

  return `On-Off-Boarding <${trimmed}>`
}

const DEFAULT_FROM =
  buildFromAddress(process.env.RESEND_EMAIL_FROM) ??
  buildFromAddress(process.env.EMAIL_FROM) ??
  null

if (!DEFAULT_FROM) {
  console.warn(
    "⚠️ Není nastavená proměnná RESEND_EMAIL_FROM/EMAIL_FROM – e-maily nepůjde korektně odeslat (chybí FROM)."
  )
}

export type EmailRecord = {
  id: number
  type: "onboarding" | "offboarding"
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  position: string | null
  department: string | null
  date: string | Date | null
}

export async function sendMail(params: {
  to?: string[]
  bcc?: string[]
  subject: string
  html: string
  from?: string
}): Promise<void> {
  const toClean = Array.from(
    new Set((params.to ?? []).map((v) => v?.trim()).filter(Boolean))
  )
  const bccClean = Array.from(
    new Set((params.bcc ?? []).map((v) => v?.trim()).filter(Boolean))
  )

  if (!bccClean.length && !toClean.length) {
    throw new Error("Missing recipients")
  }

  const fallbackTo =
    toClean.length > 0
      ? toClean
      : [
          process.env.RESEND_EMAIL_TO ??
            process.env.EMAIL_FROM ??
            process.env.RESEND_EMAIL_FROM ??
            "no-reply@example.com",
        ]

  if (!resend) {
    console.warn("Resend není nastaven – e-mail by se teď neposlal.")
    console.warn("TO:", fallbackTo)
    console.warn("BCC:", bccClean)
    return
  }

  const fromFinal =
    params.from && params.from.trim().length ? params.from.trim() : DEFAULT_FROM

  if (!fromFinal) {
    throw new Error(
      "Nelze odeslat e-mail – není nastaven FROM (RESEND_EMAIL_FROM / EMAIL_FROM)."
    )
  }

  await resend.emails.send({
    from: fromFinal,
    to: fallbackTo,
    ...(bccClean.length ? { bcc: bccClean } : {}),
    subject: params.subject,
    html: params.html,
  })
}

export function parseRecipientsEnv(value?: string | null): string[] {
  if (!value) return []

  const cleaned = value.trim().replace(/^["']|["']$/g, "")

  return cleaned
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes("@"))
}

function kindLabels(kind: "planned" | "actual" | "all") {
  void kind

  return {
    subtitle: "Přehled personálních změn",
    onboardingDateHeader: "Datum nástupu",
    offboardingDateHeader: "Datum ukončení",
  }
}

function formatName(
  r: Pick<EmailRecord, "name" | "surname" | "titleBefore" | "titleAfter">
): string {
  const parts: string[] = []
  if (r.titleBefore) parts.push(r.titleBefore)
  parts.push(r.name, r.surname)
  if (r.titleAfter) parts.push(r.titleAfter)
  return parts.join(" ")
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const dt = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return "—"
  return format(dt, "dd.MM.yyyy")
}

export function buildMonthlyReportSubject(month: string): string {
  const baseDate = new Date(`${month}-01T00:00:00`)
  const monthLabel = format(baseDate, "LLLL yyyy", { locale: cs })
  return `Přehled personálních změn – ${monthLabel}`
}

export async function renderMonthlyReportHtml(args: {
  records: EmailRecord[]
  month: string
  kind: "planned" | "actual" | "all"
}): Promise<string> {
  const { records, month, kind } = args

  const baseDate = new Date(`${month}-01T00:00:00`)
  const monthLabel = format(baseDate, "LLLL yyyy", { locale: cs })

  const onboardings = records.filter((r) => r.type === "onboarding")
  const offboardings = records.filter((r) => r.type === "offboarding")

  const { onboardingDateHeader, offboardingDateHeader } = kindLabels(kind)

  const primary = "#00847C"

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      margin: 0;
      padding: 24px 12px;
      background: #E5F5F2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #082B2A;
    }
    .wrapper {
      max-width: 840px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #d1e7e2;
      overflow: hidden;
      box-shadow: 0 8px 20px rgba(0,0,0,0.04);
    }
    .header {
      padding: 16px 24px 14px;
      background: ${primary};
      color: #ffffff;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    .header-eyebrow {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.9;
      margin-bottom: 4px;
    }
    .header-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .badge {
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.9);
    }
    .intro {
      padding: 14px 24px 16px;
      background: #E5F5F2;
      font-size: 13px;
      line-height: 1.6;
      border-bottom: 1px solid #d1e7e2;
    }
    .content {
      padding: 20px 24px 24px;
      font-size: 13px;
      background: #ffffff;
    }
    h2.section-title {
      margin-top: 18px;
      margin-bottom: 6px;
      font-size: 15px;
      font-weight: 600;
      color: #111827;
    }
    .section-note {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 16px;
    }
    thead tr {
      background: ${primary};
      color: #ffffff;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
    }
    tbody tr:nth-child(even) td {
      background: #f9fafb;
    }
    .name-cell {
      font-weight: 600;
    }
    .email-cell {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 11px;
      color: #374151;
    }
    .dept-cell {
      font-weight: 500;
    }
    .date-cell {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 11px;
      color: #4b5563;
    }
    .empty {
      margin-top: 8px;
      padding: 16px 12px;
      border-radius: 8px;
      border: 1px dashed #d1d5db;
      background: #f9fafb;
      font-style: italic;
      color: #6b7280;
      text-align: center;
    }
    .footer {
      padding: 14px 24px 16px;
      border-top: 1px solid #d1e7e2;
      background: #E5F5F2;
      font-size: 11px;
      color: #4b5563;
    }

    /* Dark mode – tam kde to klient podporuje */
    @media (prefers-color-scheme: dark) {
      body {
        background: #020617;
        color: #E5F4F2;
      }
      .card {
        background: #020617;
        border-color: #0f172a;
        box-shadow: 0 12px 24px rgba(0,0,0,0.6);
      }
      .intro {
        background: #022C22;
        border-bottom-color: #064E3B;
      }
      .content {
        background: transparent;
      }
      h2.section-title {
        color: #E5F4F2;
      }
      .section-note {
        color: #9ca3af;
      }
      th, td {
        border-bottom-color: #1f2937;
      }
      tbody tr:nth-child(even) td {
        background: #02081f;
      }
      .email-cell,
      .date-cell {
        color: #d1d5db;
      }
      .empty {
        background: #020617;
        border-color: #374151;
        color: #9ca3af;
      }
      .footer {
        background: #022C22;
        border-top-color: #064E3B;
        color: #9ca3af;
      }
    }

    @media (max-width: 600px) {
      body { padding: 16px 8px; }
      .header, .intro, .content, .footer {
        padding-left: 16px;
        padding-right: 16px;
      }
      table { font-size: 11px; }
      th, td { padding: 7px 6px; }
    }
  `

  const renderTable = (rows: EmailRecord[], dateHeader: string): string => {
    if (!rows.length) return ""

    return `
      <table>
        <thead>
          <tr>
            <th>Zaměstnanec</th>
            <th>Pozice</th>
            <th>Odbor</th>
            <th>${dateHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
                <tr>
                  <td class="name-cell">${formatName(r)}</td>
                  <td>${r.position ?? "—"}</td>
                  <td class="dept-cell">${r.department ?? "—"}</td>
                  <td class="date-cell">${fmtDate(r.date)}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `
  }

  return `
<!DOCTYPE html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Přehled personálních změn – ${monthLabel}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <div class="header-eyebrow">Personální změny</div>
          <div class="header-title">Přehled personálních změn – ${monthLabel}</div>
        </div>

        <div class="intro">
          Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace
          o vzniku a ukončení pracovních poměrů v měsíci <strong>${monthLabel}</strong>.
        </div>

        <div class="content">
          ${
            onboardings.length
              ? `
                <h2 class="section-title">Nástupy</h2>
                <div class="section-note">
                  Seznam zaměstnanců s nástupem v daném měsíci.
                </div>
                ${renderTable(onboardings, onboardingDateHeader)}
              `
              : ""
          }

          ${
            offboardings.length
              ? `
                <h2 class="section-title">Odchody</h2>
                <div class="section-note">
                  Seznam zaměstnanců s ukončením pracovního poměru v daném měsíci.
                </div>
                ${renderTable(offboardings, offboardingDateHeader)}
              `
              : ""
          }

          ${
            !onboardings.length && !offboardings.length
              ? `<div class="empty">
                  Pro vybraný měsíc nejsou evidovány žádné personální změny.
                </div>`
              : ""
          }
        </div>

        <div class="footer">
          Tento e-mail byl automaticky vygenerován systémem On-Off-Boarding ÚMČ Praha&nbsp;6.
          Neodpovídejte prosím na tento e-mail – v případě dotazů kontaktujte personální oddělení.
        </div>
      </div>
    </div>
  </body>
</html>`
}

export async function logEmailHistory(args: {
  onboardingEmployeeId?: number | null
  offboardingEmployeeId?: number | null
  mailQueueId?: number | null
  emailType: MailJobType
  recipients: string[]
  subject: string
  content: string
  status: MailJobStatus
  error?: string | null
  createdBy: string
}): Promise<void> {
  await prisma.emailHistory.create({
    data: {
      onboardingEmployeeId: args.onboardingEmployeeId ?? null,
      offboardingEmployeeId: args.offboardingEmployeeId ?? null,
      mailQueueId: args.mailQueueId ?? null,
      emailType: args.emailType,
      recipients: args.recipients,
      subject: args.subject,
      content: args.content,
      status: args.status,
      error: args.error ?? null,
      createdBy: args.createdBy,
    },
  })
}

export function getEmailSender() {
  return { send: sendMail }
}
