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

  return `On-Boarding-Modul <${trimmed}>`
}

const DEFAULT_FROM = buildFromAddress(process.env.RESEND_EMAIL_FROM) ?? null

if (!DEFAULT_FROM) {
  console.warn(
    "⚠️ Není nastavená proměnná RESEND_EMAIL_FROM – e-maily nepůjde korektně odeslat (chybí FROM)."
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

function htmlToText(html: string): string {
  let text = html

  text = text.replace(/<style[\s\S]*?<\/style>/gi, "")
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "")

  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/p>/gi, "\n\n")
  text = text.replace(/<\/h[1-6]>/gi, "\n\n")

  text = text.replace(/<\/?[^>]+>/g, "")

  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  text = text.replace(/\n{3,}/g, "\n\n")

  return text.trim()
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
  const bgLight = "#E5F5F2"

  const renderTable = (rows: EmailRecord[], dateHeader: string): string => {
    if (!rows.length) return ""

    return `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%; border-collapse: collapse; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif; font-size: 13px; margin-bottom: 25px;">
        <thead>
          <tr bgcolor="${primary}" style="background-color: ${primary}; color: #ffffff;">
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Zaměstnanec</th>
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Pozice</th>
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Odbor</th>
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">${dateHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color: ${
              i % 2 === 0 ? "#ffffff" : "#f9fafb"
            };">
              <td class="row-text name-primary" style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #111827;">${formatName(
                r
              )}</td>
              <td class="row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${
                r.position ?? "—"
              }</td>
              <td class="row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${
                r.department ?? "—"
              }</td>
              <td class="row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827; font-family: monospace;">${fmtDate(
                r.date
              )}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `
  }

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Přehled personálních změn – ${monthLabel}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
    
        .intro-text {
          font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #082B2A;
        }
    
        .card-border {
          border: 1px solid #d9ece7;
        }
    
        .intro-row {
          border-bottom: 1px solid #d9ece7;
        }
    
        .footer-row {
          border-top: 1px solid #d9ece7;
        }
    
        .row-text {
          color: #111827;
        }
    
        .name-primary {
          font-weight: 600;
        }
    
        @media only screen and (min-width: 600px) {
          .card-shadow {
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
            border-radius: 12px !important;
          }
          .rounded-top { border-radius: 12px 12px 0 0 !important; }
          .rounded-bottom { border-radius: 0 0 12px 12px !important; }
        }
    
        @media (prefers-color-scheme: dark) {
          body {
            background-color: #111827 !important;
          }
          .outer-bg {
            background-color: #111827 !important;
          }
    
          .intro-text { color: #F9FAFB !important; }
          .card-border { border-color: #4b5563 !important; }
          .intro-row { border-bottom-color: #4b5563 !important; }
          .footer-row { border-top-color: #4b5563 !important; }
    
          .row-text {
            color: #F9FAFB !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important;">
      <table class="outer-bg" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table class="card-shadow card-border" border="0" cellpadding="0" cellspacing="0" width="800" style="max-width: 800px; background-color: #ffffff; border-collapse: separate; border: 1px solid #d9ece7;">
              <tr>
                <td class="rounded-top" bgcolor="${primary}" style="padding: 25px 30px; background-color: ${primary};">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="color: #ffffff; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;">
                        <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; opacity: 0.9;">Personální změny</div>
                        <div style="font-size: 24px; font-weight: bold; line-height: 1.2;">Přehled personálních změn – ${monthLabel}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
              <tr>
                <td class="intro-row intro-text" bgcolor="${bgLight}" style="padding: 15px 30px; border-bottom: 1px solid #d9ece7;">
                  Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace o vzniku a ukončení pracovních poměrů v měsíci <strong>${monthLabel}</strong>.
                </td>
              </tr>
    
              <tr>
                <td style="padding: 30px; background-color: #ffffff; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;">
                  ${
                    onboardings.length
                      ? `
                    <h2 style="font-size: 18px; color: #111827; margin: 0 0 5px 0;">Nástupy</h2>
                    <p style="font-size: 13px; color: #6b7280; margin: 0 0 15px 0;">Seznam zaměstnanců s nástupem v daném měsíci.</p>
                    ${renderTable(onboardings, onboardingDateHeader)}
                    `
                      : ""
                  }
    
                  ${
                    offboardings.length
                      ? `
                    <h2 style="font-size: 18px; color: #111827; margin: 20px 0 5px 0;">Odchody</h2>
                    <p style="font-size: 13px; color: #6b7280; margin: 0 0 15px 0;">Seznam zaměstnanců s ukončením pracovního poměru v daném měsíci.</p>
                    ${renderTable(offboardings, offboardingDateHeader)}
                    `
                      : ""
                  }
    
                  ${
                    !onboardings.length && !offboardings.length
                      ? `
                    <div style="padding: 40px; text-align: center; border: 2px dashed #d9ece7; color: #6b7280; font-style: italic;">
                      Pro tento měsíc nejsou evidovány žádné personální změny.
                    </div>
                    `
                      : ""
                  }
                </td>
              </tr>
    
              <tr>
                <td class="rounded-bottom footer-row" bgcolor="${bgLight}" style="padding: 20px 30px; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #4b5563; line-height: 1.5; border-top: 1px solid #d9ece7;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        Tento e-mail byl automaticky vygenerován systémem
                        <strong>On-Boarding Modul ÚMČ Praha&nbsp;6</strong>.<br/>
                        Prosíme neodpovídejte na tuto zprávu. V případě dotazů kontaktujte personální oddělení.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
    
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
}

export async function sendMail(params: {
  to?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  from?: string
}): Promise<void> {
  const toClean = Array.from(
    new Set((params.to ?? []).map((v) => v?.trim()).filter(Boolean))
  )
  const bccClean = Array.from(
    new Set((params.bcc ?? []).map((v) => v?.trim()).filter(Boolean))
  )

  if (!toClean.length && !bccClean.length) {
    throw new Error("Missing recipients")
  }

  if (!resend) {
    console.warn("Resend není nastaven – e-mail by se teď neposlal.")
    console.warn("TO:", toClean)
    console.warn("BCC:", bccClean)
    return
  }

  const fromFinal =
    params.from && params.from.trim().length ? params.from.trim() : DEFAULT_FROM

  if (!fromFinal) {
    throw new Error(
      "Nelze odeslat e-mail – není nastaven FROM (RESEND_EMAIL_FROM)."
    )
  }

  const textBody = params.text ?? htmlToText(params.html)

  if (!toClean.length && bccClean.length) {
    for (const recipient of bccClean) {
      await resend.emails.send({
        from: fromFinal,
        to: [recipient],
        subject: params.subject,
        html: params.html,
        text: textBody,
      })
    }
    return
  }

  await resend.emails.send({
    from: fromFinal,
    to: toClean,
    ...(bccClean.length ? { bcc: bccClean } : {}),
    subject: params.subject,
    html: params.html,
    text: textBody,
  })
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
