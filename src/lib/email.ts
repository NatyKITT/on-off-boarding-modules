import type { MailJobStatus, MailJobType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Resend } from "resend"

import { prisma } from "@/lib/db"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

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
  to: string[]
  subject: string
  html: string
}): Promise<void> {
  const to = Array.from(new Set((params.to ?? []).filter(Boolean)))
  if (!to.length) throw new Error("Missing recipients")

  if (resend) {
    await resend.emails.send({
      from: process.env.MAIL_FROM ?? "onboarding@resend.dev",
      to,
      subject: params.subject,
      html: params.html,
    })
  } else {
    console.warn("Resend není nastaven.")
  }
}

function kindLabels(kind: "planned" | "actual" | "all") {
  if (kind === "planned") {
    return {
      subtitle: "Měsíční přehled plánovaných změn",
      onboardingDateHeader: "Plánovaný nástup",
      offboardingDateHeader: "Plánované ukončení",
      badge: "Plánované",
    }
  }
  if (kind === "actual") {
    return {
      subtitle: "Měsíční přehled skutečných změn",
      onboardingDateHeader: "Skutečný nástup",
      offboardingDateHeader: "Skutečné ukončení",
      badge: "Skutečné",
    }
  }
  return {
    subtitle: "Měsíční přehled plánovaných + skutečných změn",
    onboardingDateHeader: "Datum nástupu",
    offboardingDateHeader: "Datum ukončení",
    badge: "Plánované + Skutečné",
  }
}

function formatName(
  r: Pick<EmailRecord, "name" | "surname" | "titleBefore" | "titleAfter">
) {
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

  const { subtitle, onboardingDateHeader, offboardingDateHeader, badge } =
    kindLabels(kind)

  const primary = "#00847C"

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      margin: 0;
      padding: 24px 12px;
      background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
    }
    .wrapper {
      max-width: 840px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }
    .header {
      padding: 18px 24px;
      background: ${primary};
      color: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }
    .header-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header-subtitle {
      font-size: 13px;
      opacity: 0.95;
      margin-bottom: 8px;
    }
    .header-badges {
      display: flex;
      gap: 8px;
      font-size: 11px;
    }
    .badge {
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.9);
    }
    .content {
      padding: 20px 24px 24px;
      font-size: 13px;
    }
    .intro {
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .intro p + p {
      margin-top: 6px;
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
      color: ${primary};
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
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      font-size: 11px;
      color: #6b7280;
    }
    @media (max-width: 600px) {
      body { padding: 16px 8px; }
      .header, .content, .footer { padding-left: 16px; padding-right: 16px; }
      table { font-size: 11px; }
      th, td { padding: 7px 6px; }
    }
  `

  const kindSentence =
    kind === "planned"
      ? "přehled plánovaných nástupů a ukončení pracovního poměru"
      : kind === "actual"
        ? "přehled skutečných nástupů a ukončení pracovního poměru"
        : "přehled plánovaných i skutečných nástupů a ukončení pracovního poměru"

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
    <title>Personální změny – ${monthLabel}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <div class="header">
          <div class="header-title">Personální změny – ${monthLabel}</div>
          <div class="header-subtitle">${subtitle}</div>
          <div class="header-badges">
            <span class="badge">${monthLabel}</span>
            <span class="badge">${badge}</span>
          </div>
        </div>
        <div class="content">
          <div class="intro">
            <p>Vážená paní, vážený pane,</p>
            <p>tento e-mail obsahuje ${kindSentence} zaměstnanců Úřadu MČ Praha&nbsp;6 za měsíc <strong>${monthLabel}</strong>.</p>
          </div>

          ${
            onboardings.length
              ? `
                <h2 class="section-title">Nástupy</h2>
                <div class="section-note">Seznam zaměstnanců s nástupem v daném měsíci.</div>
                ${renderTable(onboardings, onboardingDateHeader)}
              `
              : ""
          }

          ${
            offboardings.length
              ? `
                <h2 class="section-title">Odchody</h2>
                <div class="section-note">Seznam zaměstnanců s ukončením pracovního poměru v daném měsíci.</div>
                ${renderTable(offboardings, offboardingDateHeader)}
              `
              : ""
          }

          ${
            !onboardings.length && !offboardings.length
              ? `<div class="empty">Pro vybraný měsíc nejsou evidovány žádné personální změny.</div>`
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
