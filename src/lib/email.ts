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
      from: process.env.MAIL_FROM ?? "no-reply@firma.cz",
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
  const monthLabel = format(new Date(`${month}-01`), "LLLL yyyy", {
    locale: cs,
  })

  const onboardings = records.filter((r) => r.type === "onboarding")
  const offboardings = records.filter((r) => r.type === "offboarding")

  const { subtitle, onboardingDateHeader, offboardingDateHeader, badge } =
    kindLabels(kind)

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6; color: #1a202c; background: #f3f4f6; padding: 36px 16px;
    }
    .wrapper { max-width: 820px; margin: 0 auto; }
    .container { background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.08); overflow: hidden; }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 32px 28px; text-align: left; position: relative;
    }
    .header h1 { color: #fff; font-size: 26px; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.3px; }
    .header .subtitle { color: rgba(255,255,255,0.92); font-size: 15px; }
    .badges { margin-top: 10px; display:inline-flex; gap:8px; align-items:center; }
    .badge {
      display: inline-block; background: rgba(255,255,255,0.22); color: #fff; padding: 5px 12px;
      border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
    }
    .content { padding: 28px; }
    .greeting { font-size: 15px; color: #4a5568; margin-bottom: 24px; line-height: 1.8; }
    .section { margin-bottom: 28px; }
    .section-header { display: flex; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    .section-icon {
      width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      margin-right: 12px; font-size: 18px;
    }
    .onb { background: #c6f6d5; color: #22543d; }
    .offb { background: #fed7d7; color: #742a2a; }
    .section-title { font-size: 18px; font-weight: 700; color: #2d3748; flex: 1; }
    .section-count { background: #edf2f7; color: #4a5568; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; background: #f9fafb; border-radius: 12px; overflow: hidden; }
    th {
      background: #eef2ff; padding: 12px 14px; text-align: left; font-size: 12px; font-weight: 800; color: #4f46e5;
      text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #e5e7eb;
    }
    td { padding: 14px; background: #fff; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #1f2937; }
    tr:last-child td { border-bottom: none; }
    .employee-name { font-weight: 700; color: #111827; }
    .position { color: #4b5563; }
    .department { font-weight: 600; color: #6366f1; }
    .date { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; color: #6b7280; }
    .empty { text-align: center; padding: 36px; color: #9ca3af; font-style: italic; background: #ffffff; border: 1px dashed #e5e7eb; border-radius: 12px; }
    .footer { background: #f9fafb; padding: 24px 28px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; }
    .meta { text-align: center; margin-top: 16px; padding: 10px; background: #eef2ff; border-radius: 8px; font-size: 12px; color: #94a3b8; }
    @media (max-width: 600px) {
      body { padding: 20px 8px; } .header { padding: 24px 18px; } .content, .footer { padding: 22px 18px; }
      th, td { padding: 10px; } .section-title { font-size: 16px; }
    }
  `

  return `
<!DOCTYPE html>
<html lang="cs">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Personální změny – ${monthLabel}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header">
          <h1>Personální změny</h1>
          <div class="subtitle">${subtitle}</div>
          <div class="badges">
            <span class="badge">${monthLabel}</span>
            <span class="badge">${badge}</span>
          </div>
        </div>

        <div class="content">
          <div class="greeting">
            Vážená paní, vážený pane,<br>
            dovoluji si Vás informovat o vzniku a ukončení pracovních poměrů v měsíci
            <strong>${monthLabel}</strong>.
          </div>

          ${
            onboardings.length > 0
              ? `
          <div class="section">
            <div class="section-header">
              <div class="section-icon onb">📥</div>
              <div class="section-title">Vznik pracovního poměru</div>
              <div class="section-count">${onboardings.length}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Zaměstnanec</th>
                  <th>Pozice</th>
                  <th>Odbor</th>
                  <th>${onboardingDateHeader}</th>
                </tr>
              </thead>
              <tbody>
                ${onboardings
                  .map(
                    (r) => `
                  <tr>
                    <td class="employee-name">${formatName(r)}</td>
                    <td class="position">${r.position ?? "—"}</td>
                    <td class="department">${r.department ?? "—"}</td>
                    <td class="date">${fmtDate(r.date)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
              : ""
          }

          ${
            offboardings.length > 0
              ? `
          <div class="section">
            <div class="section-header">
              <div class="section-icon offb">📤</div>
              <div class="section-title">Ukončení pracovního poměru</div>
              <div class="section-count">${offboardings.length}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Zaměstnanec</th>
                  <th>Pozice</th>
                  <th>Odbor</th>
                  <th>${offboardingDateHeader}</th>
                </tr>
              </thead>
              <tbody>
                ${offboardings
                  .map(
                    (r) => `
                  <tr>
                    <td class="employee-name">${formatName(r)}</td>
                    <td class="position">${r.position ?? "—"}</td>
                    <td class="department">${r.department ?? "—"}</td>
                    <td class="date">${fmtDate(r.date)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
              : ""
          }

          ${
            onboardings.length === 0 && offboardings.length === 0
              ? `<div class="empty">Pro vybraný měsíc nejsou evidovány žádné personální změny.</div>`
              : ""
          }
        </div>

        <div class="footer">
          Tento e-mail byl automaticky vygenerován systémem On-Off-Boarding.
          <div class="meta">Neodpovídejte prosím na tento e-mail.</div>
        </div>
      </div>
    </div>
  </body>
</html>`
}

export async function logEmailHistory(args: {
  onboardingEmployeeId?: number | null
  offboardingEmployeeId?: number | null
  emailType: "MONTHLY_SUMMARY"
  recipients: string[]
  subject: string
  content: string
  status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED"
  error?: string | null
  createdBy: string
}): Promise<void> {
  await prisma.emailHistory.create({
    data: {
      onboardingEmployeeId: args.onboardingEmployeeId ?? null,
      offboardingEmployeeId: args.offboardingEmployeeId ?? null,
      emailType: "MONTHLY_SUMMARY",
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
