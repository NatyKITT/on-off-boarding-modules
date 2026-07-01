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
  personalNumber?: string | null
  positionNum?: string | null
}

export function parseRecipientsEnv(value?: string | null): string[] {
  if (!value) return []

  const cleaned = value.trim().replace(/^["']|["']$/g, "")

  return cleaned
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes("@"))
}

export function getHrRecipientsFromEnv(): string[] {
  return parseRecipientsEnv(process.env.HR_EMAILS)
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

  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return "—"
    return format(d, "dd.MM.yyyy")
  }

  const raw = d.trim()

  if (!raw || raw === "—") return "—"

  if (/^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(raw)) {
    return raw.replace(/\s+/g, " ")
  }

  const dt = new Date(raw)

  if (Number.isNaN(dt.getTime())) {
    return raw
  }

  return format(dt, "dd.MM.yyyy")
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderExitChecklistInfoTable(args: {
  primary: string
  bgLight: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  extraRows?: Array<{
    label: string
    value?: string | null
    strong?: boolean
  }>
}) {
  const rows = [
    ...(args.extraRows ?? []),
    {
      label: "Zaměstnanec",
      value: args.employeeName,
      strong: true,
    },
    {
      label: "Pozice",
      value: args.employeePosition || "—",
    },
    {
      label: "Odbor",
      value: args.employeeDepartment || "—",
    },
    {
      label: "Datum odchodu",
      value: fmtDate(args.employmentEndDate),
    },
  ]

  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="margin-bottom:24px;border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${rows
        .map((row, index) => {
          const isHighlighted = index === 0 || row.strong
          const bg = index % 2 === 0 ? args.bgLight : "#ffffff"

          return `
            <tr style="background-color:${bg};">
              <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                ${escapeHtml(row.label)}
              </td>
              <td style="padding:10px 16px;font-size:14px;line-height:1.4;color:${
                isHighlighted ? "#082B2A" : "#374151"
              };font-weight:${isHighlighted ? 700 : 400};">
                ${escapeHtml(row.value || "—")}
              </td>
            </tr>
          `
        })
        .join("")}
    </table>
  `
}

function plannedScopeLabel(hasOnboarding: boolean, hasOffboarding: boolean) {
  if (hasOnboarding && hasOffboarding) return "předpokládané nástupy a odchody"
  if (hasOffboarding) return "předpokládané odchody"
  return "předpokládané nástupy"
}

function kindLabels(args: {
  kind: "planned" | "actual" | "all"
  hasOnboarding: boolean
  hasOffboarding: boolean
}) {
  const { kind, hasOnboarding, hasOffboarding } = args

  if (kind === "planned") {
    return {
      subtitle: `Přehled personálních změn – ${plannedScopeLabel(
        hasOnboarding,
        hasOffboarding
      )}`,
      onboardingDateHeader: "Datum nástupu",
      offboardingDateHeader: "Datum odchodu",
    }
  }

  return {
    subtitle: "Přehled personálních změn",
    onboardingDateHeader: "Datum nástupu",
    offboardingDateHeader: "Datum odchodu",
  }
}

export function buildMonthlyReportSubject(
  month: string,
  kind: "planned" | "actual" | "all" = "actual",
  opts?: { hasOnboarding?: boolean; hasOffboarding?: boolean }
): string {
  const baseDate = new Date(`${month}-01T00:00:00`)
  const monthLabel = format(baseDate, "LLLL yyyy", { locale: cs })

  if (kind === "planned") {
    const hasOnboarding = opts?.hasOnboarding ?? true
    const hasOffboarding = opts?.hasOffboarding ?? false
    const scope = plannedScopeLabel(hasOnboarding, hasOffboarding)
    return `Přehled personálních změn – ${scope} – ${monthLabel}`
  }

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

  const hasOnboarding = onboardings.length > 0
  const hasOffboarding = offboardings.length > 0

  const { subtitle, onboardingDateHeader, offboardingDateHeader } = kindLabels({
    kind,
    hasOnboarding,
    hasOffboarding,
  })

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const renderTableActual = (
    rows: EmailRecord[],
    dateHeader: string
  ): string => {
    if (!rows.length) return ""

    return `
      <table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="width:100%; border-collapse: collapse; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif; font-size: 13px; margin-bottom: 22px;">
        <thead>
          <tr bgcolor="${primary}" style="background-color: ${primary}; color: #ffffff;">
            <th class="thcell" align="left" style="padding: 10px; width: 220px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Zaměstnanec</th>
            <th class="thcell" align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Pozice</th>
            <th class="thcell" align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px;">Odbor</th>
            <th class="thcell" align="left" style="padding: 10px; width: 120px; font-weight: 600; text-transform: uppercase; font-size: 11px; white-space: nowrap;">${dateHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color: ${
              i % 2 === 0 ? "#ffffff" : "#f9fafb"
            };">

              <td class="cell row-text name-primary" style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                ${formatName(r)}
              </td>

              <td class="cell row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                ${r.position ?? "—"}
              </td>

              <td class="cell row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">
                ${r.department ?? "—"}
              </td>

              <td class="cell row-text" style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums;">
                ${fmtDate(r.date)}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `
  }

  const renderTablePlanned = (
    rows: EmailRecord[],
    dateHeader: string
  ): string => {
    if (!rows.length) return ""

    return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%; border-collapse: collapse; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif; font-size: 13px; margin-bottom: 22px;">
      <thead>
        <tr bgcolor="${primary}" style="background-color: ${primary}; color: #ffffff;">

          <th class="thcell" align="left"
              style="padding: 10px; width: 220px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            Zaměstnanec
          </th>

          <th class="thcell" align="left"
              style="padding: 10px; width: 95px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            Osobní číslo
          </th>

          <th class="thcell" align="left"
              style="padding: 10px; width: 200px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            Pozice
          </th>

          <th class="thcell" align="left"
              style="padding: 10px; width: 190px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            Odbor
          </th>

          <th class="thcell" align="left"
              style="padding: 10px; width: 105px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            Číslo funkce
          </th>

          <th class="thcell" align="left"
              style="padding: 10px; width: 120px; font-weight: 600; text-transform: uppercase; font-size: 11px;">
            ${dateHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r, i) => `
          <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}"
              style="background-color: ${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">

            <td class="cell row-text name-primary"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
              ${formatName(r)}
            </td>

            <td class="cell row-text"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
              ${r.personalNumber ?? "—"}
            </td>

            <td class="cell row-text"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
              ${r.position ?? "—"}
            </td>

            <td class="cell row-text"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">
              ${r.department ?? "—"}
            </td>

            <td class="cell row-text"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
              ${r.positionNum ?? "—"}
            </td>

            <td class="cell row-text"
                style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums;">
              ${fmtDate(r.date)}
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `
  }

  const renderTable =
    kind === "planned" ? renderTablePlanned : renderTableActual

  const onboardingTitle =
    kind === "planned" ? "Předpokládané nástupy" : "Nástupy"
  const offboardingTitle =
    kind === "planned" ? "Předpokládané odchody" : "Odchody"

  const onboardingNote =
    kind === "planned"
      ? "Seznam zaměstnanců s předpokládaným nástupem v daném měsíci."
      : "Seznam zaměstnanců s nástupem v daném měsíci."

  const offboardingNote =
    kind === "planned"
      ? "Seznam zaměstnanců s předpokládaným odchodem v daném měsíci."
      : "Seznam zaměstnanců s ukončením pracovního poměru v daném měsíci."

  const showIntro = kind !== "planned"

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${subtitle} – ${monthLabel}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }

        .intro-text {
          font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #082B2A;
        }

        .card-border { border: 1px solid #d9ece7; }
        .intro-row { border-bottom: 1px solid #d9ece7; }
        .footer-row { border-top: 1px solid #d9ece7; }

        .row-text { color: #111827; }
        .name-primary { font-weight: 600; }

        .content-pad { padding: 26px 22px !important; }

        .thcell { word-break: normal; overflow-wrap: normal; white-space: normal; }
        .cell { word-break: normal; overflow-wrap: normal; }


        @media only screen and (min-width: 600px) {
          .card-shadow {
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
            border-radius: 12px !important;
          }
          .rounded-top { border-radius: 12px 12px 0 0 !important; }
          .rounded-bottom { border-radius: 0 0 12px 12px !important; }
        }

        @media only screen and (max-width: 600px) {
          .content-pad { padding: 18px 14px !important; }

          .thcell { padding: 8px !important; font-size: 10px !important; }
          .cell { padding: 8px !important; font-size: 12px !important; }
        }

        @media (prefers-color-scheme: dark) {
          body { background-color: #111827 !important; }
          .outer-bg { background-color: #111827 !important; }

          .intro-text { color: #F9FAFB !important; }
          .card-border { border-color: #4b5563 !important; }
          .intro-row { border-bottom-color: #4b5563 !important; }
          .footer-row { border-top-color: #4b5563 !important; }

          .row-text { color: #F9FAFB !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important;">
      <table class="outer-bg" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table
              class="card-shadow card-border"
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="860"
              style="
                max-width: 820px;
                background-color: #ffffff;
                border-collapse: separate;
                border: 1px solid #d9ece7;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
              "
            >
              <tr>
                <td
                  class="rounded-top"
                  bgcolor="${primary}"
                  style="
                    padding: 25px 30px;
                    background-color: ${primary};
                    border-radius: 12px 12px 0 0;
                  "
                >
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="color: #ffffff; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;">
                        <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; opacity: 0.9;">Personální změny</div>
                        <div style="font-size: 24px; font-weight: bold; line-height: 1.2;">${subtitle} – ${monthLabel}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${
                showIntro
                  ? `
                <tr>
                  <td class="intro-row intro-text" bgcolor="${bgLight}" style="padding: 15px 30px; border-bottom: 1px solid #d9ece7;">
                    Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace o vzniku a ukončení pracovních poměrů v měsíci <strong>${monthLabel}</strong>.
                  </td>
                </tr>
                `
                  : ""
              }

              <tr>
                <td class="content-pad" style="padding: 26px 22px; background-color: #ffffff; font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;">
                  ${
                    onboardings.length
                      ? `
                    <h2 style="font-size: 16px; color: #111827; margin: 0 0 4px 0; font-weight: 700;">${onboardingTitle}</h2>
                    <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4;">${onboardingNote}</p>
                    ${renderTable(onboardings, onboardingDateHeader)}
                    `
                      : ""
                  }

                  ${
                    offboardings.length
                      ? `
                    <h2 style="font-size: 16px; color: #111827; margin: 18px 0 4px 0; font-weight: 700;">${offboardingTitle}</h2>
                    <p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4;">${offboardingNote}</p>
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
                <td
                  class="rounded-bottom footer-row"
                  bgcolor="${bgLight}"
                  style="
                    padding: 18px 26px;
                    font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;
                    font-size: 12px;
                    color: #4b5563;
                    line-height: 1.5;
                    border-top: 1px solid #d9ece7;
                    border-radius: 0 0 12px 12px;
                  "
                >
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

export type EmployeeChangeEmailRecord = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION"
  status: string
  audience?: string | null

  effectiveDate: string | Date | null

  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null

  personalNumber: string | null

  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null

  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null
}

export type EmployeeChangeReportAudience = "ONBOARDING_GROUP" | "ALL_EMPLOYEES"

function isEmployeePositionChange(type: EmployeeChangeEmailRecord["type"]) {
  return type === "POSITION" || type === "NAME_AND_POSITION"
}

function isEmployeeNameChange(type: EmployeeChangeEmailRecord["type"]) {
  return type === "NAME" || type === "NAME_AND_POSITION"
}

function formatEmployeeChangeName(record: EmployeeChangeEmailRecord) {
  return [record.titleBefore, record.name, record.surname, record.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatEmployeeChangeNewName(record: EmployeeChangeEmailRecord) {
  return [
    record.newTitleBefore ?? record.titleBefore,
    record.newName ?? record.name,
    record.newSurname ?? record.surname,
    record.newTitleAfter ?? record.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueEffectiveDates(records: EmployeeChangeEmailRecord[]) {
  const values = records
    .map((record) => fmtDate(record.effectiveDate))
    .filter((date) => date !== "—")

  return Array.from(new Set(values))
}

export function buildEmployeeChangeReportSubject(args: {
  month: string
  audience: EmployeeChangeReportAudience
}) {
  const baseDate = new Date(`${args.month}-01T00:00:00`)
  const monthLabel = format(baseDate, "LLLL yyyy", { locale: cs })

  return `Podklady pro personální změny – ${monthLabel}`
}

function renderChangePositionTableForSelectedGroup(
  records: EmployeeChangeEmailRecord[]
) {
  const rows = records.filter((record) => isEmployeePositionChange(record.type))

  if (!rows.length) return ""

  return `
    <p style="margin:26px 0 8px 0;font-size:15px;font-weight:700;color:#111827;">
      Změna pozice / odboru
    </p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%;border-collapse:collapse;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:13px;margin-bottom:24px;">
      <thead>
        <tr style="background-color:#00847C;color:#ffffff;">
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Zaměstnanec</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Účinnost</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Původní odbor</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Nový odbor</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Osobní číslo</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Původní pozice</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Nová pozice</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Původní č. funkce</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Nové č. funkce</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            (record, index) => `
              <tr style="background-color:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(fmtDate(record.effectiveDate))}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.oldDepartment || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.newDepartment || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(record.personalNumber || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.oldPositionName || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.newPositionName || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(record.oldPositionNum || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(record.newPositionNum || "—")}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `
}

function renderChangePositionTableForAllEmployees(
  records: EmployeeChangeEmailRecord[]
) {
  const rows = records.filter((record) => isEmployeePositionChange(record.type))

  if (!rows.length) return ""

  return `
    <p style="margin:26px 0 8px 0;font-size:15px;font-weight:700;color:#111827;">
      Změna pozice / odboru
    </p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%;border-collapse:collapse;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:14px;margin-bottom:24px;">
      <thead>
        <tr style="background-color:#08cdb5;color:#000000;">
          <th align="left" style="padding:9px 8px;font-weight:700;">Zaměstnanec</th>
          <th align="left" style="padding:9px 8px;font-weight:700;">Odbor</th>
          <th align="left" style="padding:9px 8px;font-weight:700;">Původní pozice</th>
          <th align="left" style="padding:9px 8px;font-weight:700;">Nová pozice</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            (record) => `
              <tr>
                <td style="padding:9px 8px;border:1px solid #111827;font-weight:600;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                </td>
                <td style="padding:9px 8px;border:1px solid #111827;font-weight:600;">
                  ${escapeHtml(record.newDepartment || record.oldDepartment || "—")}
                </td>
                <td style="padding:9px 8px;border:1px solid #111827;font-weight:600;">
                  ${escapeHtml(record.oldPositionName || "—")}
                </td>
                <td style="padding:9px 8px;border:1px solid #111827;font-weight:600;">
                  ${escapeHtml(record.newPositionName || "—")}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `
}

function renderChangeNameTable(records: EmployeeChangeEmailRecord[]) {
  const rows = records.filter((record) => isEmployeeNameChange(record.type))

  if (!rows.length) return ""

  return `
    <p style="margin:26px 0 8px 0;font-size:15px;font-weight:700;color:#111827;">
      Změna jména / příjmení / titulu
    </p>

    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%;border-collapse:collapse;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:13px;margin-bottom:24px;">
      <thead>
        <tr style="background-color:#00847C;color:#ffffff;">
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Zaměstnanec</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Účinnost</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Nové příjmení</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Nové celé jméno</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Odbor</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Osobní číslo</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Pozice</th>
          <th align="left" style="padding:9px 8px;font-size:11px;text-transform:uppercase;">Číslo funkce</th>
        </tr>
      </thead>

      <tbody>
        ${rows
          .map(
            (record, index) => `
              <tr style="background-color:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(fmtDate(record.effectiveDate))}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.newSurname || record.surname || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(formatEmployeeChangeNewName(record) || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.newDepartment || record.oldDepartment || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(record.personalNumber || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;">
                  ${escapeHtml(record.newPositionName || record.oldPositionName || "—")}
                </td>
                <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">
                  ${escapeHtml(record.newPositionNum || record.oldPositionNum || "—")}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `
}

export async function renderEmployeeChangeReportHtml(args: {
  records: EmployeeChangeEmailRecord[]
  month: string
  audience: EmployeeChangeReportAudience
}): Promise<string> {
  const { records, month, audience } = args
  const dates = uniqueEffectiveDates(records)

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const positionTable =
    audience === "ONBOARDING_GROUP"
      ? renderChangePositionTableForSelectedGroup(records)
      : renderChangePositionTableForAllEmployees(records)

  const nameTable = renderChangeNameTable(records)

  const effectiveText =
    dates.length === 1
      ? `s účinností od ${dates[0]}:`
      : "s účinností dle data uvedeného u jednotlivých záznamů:"

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="860"
              style="max-width:860px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;border-collapse:separate;">
              
              <tr>
                <td bgcolor="${primary}" style="padding:24px 30px;background-color:${primary};">
                  <div style="font-family:'Civil Premium','Segoe UI',Arial,sans-serif;color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                    Personální změny
                  </div>
                  <div style="font-family:'Civil Premium','Segoe UI',Arial,sans-serif;color:#ffffff;font-size:23px;font-weight:700;line-height:1.25;">
                    ${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:28px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;color:#111827;">
                  <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;">
                    Vážené kolegyně, vážení kolegové,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">
                    tímto vás informuji o následujících změnách:
                  </p>

                  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;font-weight:700;">
                    ${escapeHtml(effectiveText)}
                  </p>

                  ${positionTable}
                  ${nameTable}

                  ${
                    !positionTable && !nameTable
                      ? `<p style="margin:24px 0;font-size:14px;color:#6b7280;">Pro vybrané období nejsou evidované žádné změny.</p>`
                      : ""
                  }

                  <p style="margin:36px 0 0 0;font-size:15px;line-height:1.6;">
                    S pozdravem
                  </p>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:12px;color:#4b5563;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován systémem
                  <strong>On-Off-Boarding Modul ÚMČ Praha&nbsp;6</strong>.<br/>
                  Prosíme, neodpovídejte na tuto zprávu. V případě dotazů kontaktujte personální oddělení.
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

type SendSignatureInviteEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  sentByName: string
  signUrl: string
}

export async function sendSignatureInviteEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  sentByName,
  signUrl,
}: SendSignatureInviteEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const subject = `Pozvánka k podpisu výstupního listu – ${employeeName}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        .intro-text {
          font-family: 'Civil Premium', 'Segoe UI', Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #082B2A;
        }
        .card-border { border: 1px solid #d9ece7; }
        @media only screen and (min-width: 600px) {
          .card-shadow {
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
            border-radius: 12px !important;
          }
          .rounded-top { border-radius: 12px 12px 0 0 !important; }
          .rounded-bottom { border-radius: 0 0 12px 12px !important; }
        }
        @media only screen and (max-width: 600px) {
          .content-pad { padding: 18px 14px !important; }
        }
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table
              class="card-shadow card-border"
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr>
                <td
                  class="rounded-top"
                  bgcolor="${primary}"
                  style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;"
                >
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                        <div style="font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:0.9;">
                          Výstupní list
                        </div>
                        <div style="font-size:22px;font-weight:bold;line-height:1.2;">
                          Pozvánka k podpisu
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td
                  class="content-pad"
                  style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;"
                >
                  <p class="intro-text" style="margin:0 0 16px 0;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    <strong>${escapeHtml(sentByName)}</strong> vám zaslal(a) pozvánku k elektronickému podpisu výstupního listu zaměstnance/zaměstnankyně:
                  </p>

                  ${renderExitChecklistInfoTable({
                    primary,
                    bgLight,
                    employeeName,
                    employeePosition,
                    employeeDepartment,
                    employmentEndDate,
                  })}

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    Přihlaste se svým firemním účtem Google
                    (<strong>@praha6.cz</strong>).
                  </p>

                  <p class="intro-text" style="margin:0 0 24px 0;color:#374151;">
                    Po přihlášení budete přesměrován(a) na konkrétní výstupní list,
                    kde můžete doplnit potvrzení a elektronický podpis.
                  </p>

                  <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                        <a
                          href="${escapeHtml(signUrl)}"
                          style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                        >
                          Otevřít výstupní list
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 4px 0;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:12px;color:#6b7280;">
                    Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                  </p>
                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(signUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(signUrl)}
                    </a>
                  </p>
                </td>
              </tr>

              <tr>
                <td
                  class="rounded-bottom"
                  bgcolor="${bgLight}"
                  style="padding:18px 30px;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:12px;color:#4b5563;line-height:1.5;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;"
                >
                  Tento e-mail byl automaticky vygenerován systémem
                  <strong>On-Off-Boarding Modul ÚMČ Praha&nbsp;6</strong>.<br/>
                  Prosíme, neodpovídejte na tuto zprávu. V případě dotazů kontaktujte personální oddělení.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    `${sentByName} vám zaslal(a) pozvánku k elektronickému podpisu výstupního listu.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    "Přihlaste se svým firemním účtem Google (@praha6.cz).",
    "Po přihlášení budete přesměrován(a) na konkrétní výstupní list k podpisu.",
    "",
    `Odkaz: ${signUrl}`,
  ].join("\n")

  await sendMail({
    to: [to],
    subject,
    html,
    text,
  })
}

export async function sendMail(params: {
  to?: string[]
  bcc?: string[]
  subject: string
  html: string
  text?: string
  from?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
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
    const neutralTo = (process.env.RESEND_EMAIL_FROM ?? "").trim().length
      ? (process.env.RESEND_EMAIL_FROM as string).trim()
      : fromFinal

    await resend.emails.send({
      from: fromFinal,
      to: [neutralTo],
      ...(bccClean.length ? { bcc: bccClean } : {}),
      subject: params.subject,
      html: params.html,
      text: textBody,
      ...(params.attachments?.length
        ? { attachments: params.attachments }
        : {}),
    })

    return
  }

  await resend.emails.send({
    from: fromFinal,
    to: toClean,
    ...(bccClean.length ? { bcc: bccClean } : {}),
    subject: params.subject,
    html: params.html,
    text: textBody,
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  })
}

export async function logEmailHistory(args: {
  onboardingEmployeeId?: number | null
  offboardingEmployeeId?: number | null
  changeId?: number | null
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
      changeId: args.changeId ?? null,
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

export type SendProbationNotificationEmailParams = {
  to: string[]
  subject: string
  intro: string
  employeeName?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  evaluationLink?: string | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  formType?: string | null
}

export type SendProbationEvaluationInviteEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  evaluationLink: string
  formType?: string | null
  sentByName?: string | null
}

export type SendProbationEvaluationReminderEmailParams =
  SendProbationEvaluationInviteEmailParams

export type SendProbationEvaluationPdfEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  message?: string | null
  sentByName?: string | null
  pdfBuffer: Buffer
  filename: string
}

export type SendProbationEvaluationCompletedEmailParams = {
  to: string[]
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  completedByName?: string | null
  pdfBuffer: Buffer
  filename: string
}

export type ProbationMailQueuePayload = {
  recipients?: string[]
  to?: string
  supervisorEmail?: string | null
  employeeName?: string | null
  position?: string | null
  employeePosition?: string | null
  department?: string | null
  employeeDepartment?: string | null
  unitName?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  evaluationLink?: string | null
  formType?: string | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  subject?: string | null
  intro?: string | null
  message?: string | null
  sentByName?: string | null
}

function probationFormTypeLabel(value?: string | null) {
  if (value === "MANAGERIAL") return "Vedoucí / manažerská pozice"
  if (value === "REGULAR_EMPLOYEE") return "Zaměstnanec"
  return null
}

function normalizeEmailList(values?: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((email) => email?.trim())
        .filter((email): email is string =>
          Boolean(email && email.includes("@"))
        )
    )
  )
}

function normalizeProbationRecipients(payload: ProbationMailQueuePayload) {
  return normalizeEmailList([...(payload.recipients ?? []), payload.to])
}

function getProbationEmployeePosition(payload: ProbationMailQueuePayload) {
  return payload.employeePosition ?? payload.position ?? null
}

function getProbationEmployeeDepartment(payload: ProbationMailQueuePayload) {
  return payload.employeeDepartment ?? payload.department ?? null
}

function getProbationEmployeeUnitName(payload: ProbationMailQueuePayload) {
  return payload.employeeUnitName ?? payload.unitName ?? null
}

function renderProbationInfoTable(args: {
  primary: string
  bgLight: string
  employeeName?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  formType?: string | null
}) {
  const rows = [
    {
      label: "Zaměstnanec",
      value: args.employeeName || "—",
      strong: true,
    },
    {
      label: "Pozice",
      value: args.employeePosition || "—",
    },
    {
      label: "Odbor",
      value: args.employeeDepartment || "—",
    },
    {
      label: "Oddělení",
      value: args.employeeUnitName || "—",
    },
    {
      label: "Typ formuláře",
      value: probationFormTypeLabel(args.formType) || null,
    },
    {
      label: "Konec zkušební doby",
      value: fmtDate(args.probationEndDate),
    },
    {
      label: "Vedoucí / hodnotitel",
      value: args.supervisorName || null,
    },
    {
      label: "E-mail vedoucího",
      value: args.supervisorEmail || null,
    },
    {
      label: "Doporučení",
      value: args.recommendation || null,
    },
    {
      label: "Hodnotil(a)",
      value: args.evaluatorName || null,
    },
    {
      label: "E-mail hodnotitele",
      value: args.evaluatorEmail || null,
    },
  ].filter((row) => Boolean(row.value) && row.value !== "—")

  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="margin-bottom:24px;border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${rows
        .map((row, index) => {
          const bg = index % 2 === 0 ? args.bgLight : "#ffffff"
          const strong = row.strong === true

          return `
            <tr style="background-color:${bg};">
              <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:170px;">
                ${escapeHtml(row.label)}
              </td>
              <td style="padding:10px 16px;font-size:14px;line-height:1.4;color:${
                strong ? "#082B2A" : "#374151"
              };font-weight:${strong ? 700 : 400};">
                ${escapeHtml(row.value || "—")}
              </td>
            </tr>
          `
        })
        .join("")}
    </table>
  `
}

export async function sendProbationNotificationEmail({
  to,
  subject,
  intro,
  employeeName,
  employeePosition,
  employeeDepartment,
  employeeUnitName,
  probationEndDate,
  supervisorName,
  supervisorEmail,
  evaluationLink,
  recommendation,
  evaluatorName,
  evaluatorEmail,
  formType,
}: SendProbationNotificationEmailParams): Promise<void> {
  const recipients = normalizeEmailList(to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">

              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Zkušební doba
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    ${escapeHtml(subject)}
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    ${escapeHtml(intro)}
                  </p>

                  ${renderProbationInfoTable({
                    primary,
                    bgLight,
                    employeeName,
                    employeePosition,
                    employeeDepartment,
                    employeeUnitName,
                    probationEndDate,
                    supervisorName,
                    supervisorEmail,
                    recommendation,
                    evaluatorName,
                    evaluatorEmail,
                    formType,
                  })}

                  ${
                    evaluationLink
                      ? `
                    <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                          <a
                            href="${escapeHtml(evaluationLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít vyhodnocení
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                      Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                    </p>
                    <p style="margin:0;word-break:break-all;">
                      <a href="${escapeHtml(evaluationLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                        ${escapeHtml(evaluationLink)}
                      </a>
                    </p>
                    `
                      : ""
                  }
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    intro,
    "",
    employeeName ? `Zaměstnanec: ${employeeName}` : "",
    employeePosition ? `Pozice: ${employeePosition}` : "",
    employeeDepartment ? `Odbor: ${employeeDepartment}` : "",
    employeeUnitName ? `Oddělení: ${employeeUnitName}` : "",
    formType
      ? `Typ formuláře: ${probationFormTypeLabel(formType) || formType}`
      : "",
    probationEndDate ? `Konec zkušební doby: ${fmtDate(probationEndDate)}` : "",
    supervisorName ? `Vedoucí / hodnotitel: ${supervisorName}` : "",
    supervisorEmail ? `E-mail vedoucího: ${supervisorEmail}` : "",
    recommendation ? `Doporučení: ${recommendation}` : "",
    evaluatorName ? `Hodnotil(a): ${evaluatorName}` : "",
    evaluatorEmail ? `E-mail hodnotitele: ${evaluatorEmail}` : "",
    evaluationLink ? `Odkaz: ${evaluationLink}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: recipients,
    subject,
    html,
    text,
  })
}

export async function sendProbationEvaluationInviteEmail(
  args: SendProbationEvaluationInviteEmailParams
): Promise<void> {
  await sendProbationNotificationEmail({
    to: [args.to],
    subject: `Vyhodnocení zkušební doby – ${args.employeeName}`,
    intro: `${
      args.sentByName ? `${args.sentByName} vám zaslal(a)` : "Zasíláme vám"
    } odkaz k vyplnění formuláře k vyhodnocení zkušební doby.`,
    employeeName: args.employeeName,
    employeePosition: args.employeePosition,
    employeeDepartment: args.employeeDepartment,
    employeeUnitName: args.employeeUnitName,
    probationEndDate: args.probationEndDate,
    supervisorName: args.supervisorName,
    supervisorEmail: args.supervisorEmail,
    evaluationLink: args.evaluationLink,
    formType: args.formType,
  })
}

export async function sendProbationEvaluationReminderEmail(
  args: SendProbationEvaluationReminderEmailParams
): Promise<void> {
  await sendProbationNotificationEmail({
    to: [args.to],
    subject: `Připomínka: vyhodnocení zkušební doby – ${args.employeeName}`,
    intro: `${
      args.sentByName ? `${args.sentByName} připomíná` : "Připomínáme"
    }, že formulář k vyhodnocení zkušební doby zatím není finálně vyplněný.`,
    employeeName: args.employeeName,
    employeePosition: args.employeePosition,
    employeeDepartment: args.employeeDepartment,
    employeeUnitName: args.employeeUnitName,
    probationEndDate: args.probationEndDate,
    supervisorName: args.supervisorName,
    supervisorEmail: args.supervisorEmail,
    evaluationLink: args.evaluationLink,
    formType: args.formType,
  })
}

export async function sendProbationHrReminderEmail(args: {
  to: string[]
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  evaluationLink?: string | null
  formType?: string | null
}) {
  await sendProbationNotificationEmail({
    to: args.to,
    subject: `HR připomínka: nevyplněné vyhodnocení zkušební doby – ${args.employeeName}`,
    intro:
      "Formulář k vyhodnocení zkušební doby zatím není finálně vyplněný. Prosíme o kontrolu stavu a případné kontaktování vedoucího.",
    employeeName: args.employeeName,
    employeePosition: args.employeePosition,
    employeeDepartment: args.employeeDepartment,
    employeeUnitName: args.employeeUnitName,
    probationEndDate: args.probationEndDate,
    supervisorName: args.supervisorName,
    supervisorEmail: args.supervisorEmail,
    evaluationLink: args.evaluationLink,
    formType: args.formType,
  })
}

export async function sendProbationMissingSupervisorEmail(args: {
  to: string[]
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  formType?: string | null
}) {
  await sendProbationNotificationEmail({
    to: args.to,
    subject: `Chybí vedoucí pro vyhodnocení zkušební doby – ${args.employeeName}`,
    intro:
      "U zaměstnance chybí vedoucí nebo e-mail vedoucího. Formulář proto nelze automaticky odeslat k vyplnění.",
    employeeName: args.employeeName,
    employeePosition: args.employeePosition,
    employeeDepartment: args.employeeDepartment,
    employeeUnitName: args.employeeUnitName,
    probationEndDate: args.probationEndDate,
    formType: args.formType,
  })
}

export async function sendProbationEvaluationPdfEmail(
  args: SendProbationEvaluationPdfEmailParams
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Vyhodnocení zkušební doby – ${args.employeeName}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Zkušební doba
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    PDF formuláře v příloze
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    v příloze zasíláme PDF formuláře k vyhodnocení zkušební doby níže uvedeného zaměstnance.
                  </p>

                  ${renderProbationInfoTable({
                    primary,
                    bgLight,
                    employeeName: args.employeeName,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                    probationEndDate: args.probationEndDate,
                    recommendation: args.recommendation,
                    evaluatorName: args.evaluatorName,
                    evaluatorEmail: args.evaluatorEmail,
                  })}

                  ${
                    args.message?.trim()
                      ? `<p style="margin:0 0 18px 0;padding:12px 14px;border-left:4px solid ${primary};background:#f0fdfa;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(args.message.trim())}</p>`
                      : ""
                  }

                  ${
                    args.sentByName?.trim()
                      ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">Odeslal(a): ${escapeHtml(args.sentByName.trim())}</p>`
                      : ""
                  }
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "v příloze zasíláme PDF formuláře k vyhodnocení zkušební doby níže uvedeného zaměstnance.",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.recommendation ? `Doporučení: ${args.recommendation}` : "",
    args.evaluatorName ? `Hodnotil(a): ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    args.message ? `Zpráva: ${args.message}` : "",
    args.sentByName ? `Odeslal(a): ${args.sentByName}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: [args.to],
    subject,
    html,
    text,
    attachments: [
      {
        filename: args.filename,
        content: args.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  })
}

export async function sendProbationEvaluationCompletedEmail(
  args: SendProbationEvaluationCompletedEmailParams
): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    return
  }

  const subject = `Vyhodnocení zkušební doby bylo vyplněno – ${args.employeeName}`
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Zkušební doba
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    Vyhodnocení bylo finálně vyplněno
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    formulář k vyhodnocení zkušební doby byl finálně vyplněn. PDF formulář najdete v příloze.
                  </p>

                  ${renderProbationInfoTable({
                    primary,
                    bgLight,
                    employeeName: args.employeeName,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                    probationEndDate: args.probationEndDate,
                    recommendation: args.recommendation,
                    evaluatorName: args.evaluatorName,
                    evaluatorEmail: args.evaluatorEmail,
                  })}

                  ${
                    args.completedByName?.trim()
                      ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">Uložil(a): ${escapeHtml(args.completedByName.trim())}</p>`
                      : ""
                  }
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "formulář k vyhodnocení zkušební doby byl finálně vyplněn. PDF formulář najdete v příloze.",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.recommendation ? `Doporučení: ${args.recommendation}` : "",
    args.evaluatorName ? `Hodnotil(a): ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    args.completedByName ? `Uložil(a): ${args.completedByName}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: recipients,
    subject,
    html,
    text,
    attachments: [
      {
        filename: args.filename,
        content: args.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  })
}

export async function sendQueuedProbationEmail(args: {
  type: MailJobType | string
  payload: ProbationMailQueuePayload
}): Promise<void> {
  const type = String(args.type)
  const payload = args.payload

  const employeeName = payload.employeeName?.trim() || "zaměstnanec"
  const employeePosition = getProbationEmployeePosition(payload)
  const employeeDepartment = getProbationEmployeeDepartment(payload)
  const employeeUnitName = getProbationEmployeeUnitName(payload)
  const recipients = normalizeProbationRecipients(payload)

  if (!recipients.length) {
    throw new Error("Chybí příjemci pro probation e-mail z fronty.")
  }

  if (type === "PROBATION_EVALUATION_INVITE" || type === "PROBATION_INVITE") {
    const to = payload.supervisorEmail || recipients[0]

    await sendProbationEvaluationInviteEmail({
      to,
      employeeName,
      employeePosition,
      employeeDepartment,
      employeeUnitName,
      probationEndDate: payload.probationEndDate,
      supervisorName: payload.supervisorName,
      supervisorEmail: payload.supervisorEmail,
      evaluationLink: payload.evaluationLink || "",
      formType: payload.formType,
      sentByName: payload.sentByName,
    })

    return
  }

  if (
    type === "PROBATION_EVALUATION_REMINDER" ||
    type === "PROBATION_REMINDER"
  ) {
    const to = payload.supervisorEmail || recipients[0]

    await sendProbationEvaluationReminderEmail({
      to,
      employeeName,
      employeePosition,
      employeeDepartment,
      employeeUnitName,
      probationEndDate: payload.probationEndDate,
      supervisorName: payload.supervisorName,
      supervisorEmail: payload.supervisorEmail,
      evaluationLink: payload.evaluationLink || "",
      formType: payload.formType,
      sentByName: payload.sentByName,
    })

    return
  }

  if (
    type === "PROBATION_MISSING_SUPERVISOR" ||
    type === "PROBATION_EVALUATION_MISSING_SUPERVISOR" ||
    type === "PROBATION_EVALUATION_HR_MISSING_SUPERVISOR"
  ) {
    await sendProbationMissingSupervisorEmail({
      to: recipients,
      employeeName,
      employeePosition,
      employeeDepartment,
      employeeUnitName,
      probationEndDate: payload.probationEndDate,
      formType: payload.formType,
    })

    return
  }

  if (
    type === "PROBATION_HR_REMINDER" ||
    type === "PROBATION_EVALUATION_HR_NOT_COMPLETED"
  ) {
    await sendProbationHrReminderEmail({
      to: recipients,
      employeeName,
      employeePosition,
      employeeDepartment,
      employeeUnitName,
      probationEndDate: payload.probationEndDate,
      supervisorName: payload.supervisorName,
      supervisorEmail: payload.supervisorEmail,
      evaluationLink: payload.evaluationLink,
      formType: payload.formType,
    })

    return
  }

  if (type === "PROBATION_HR_INFO" || type === "PROBATION_EVALUATION_HR_INFO") {
    await sendProbationNotificationEmail({
      to: recipients,
      subject:
        payload.subject ||
        `Informace k vyhodnocení zkušební doby – ${employeeName}`,
      intro:
        payload.intro || "Níže zasíláme informaci k vyhodnocení zkušební doby.",
      employeeName,
      employeePosition,
      employeeDepartment,
      employeeUnitName,
      probationEndDate: payload.probationEndDate,
      supervisorName: payload.supervisorName,
      supervisorEmail: payload.supervisorEmail,
      evaluationLink: payload.evaluationLink,
      recommendation: payload.recommendation,
      evaluatorName: payload.evaluatorName,
      evaluatorEmail: payload.evaluatorEmail,
      formType: payload.formType,
    })

    return
  }

  throw new Error(`Nepodporovaný typ probation e-mailu ve frontě: ${type}`)
}

export function getEmailSender() {
  return { send: sendMail }
}

type SendHandoverRecipientEmailParams = {
  to: string
  employeeName: string
  employeePosition: string
  employeeDepartment: string
  employmentEndDate: string
  option3Reason?: string | null
  sentByName?: string | null
}

export async function sendHandoverRecipientEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  option3Reason,
  sentByName,
}: SendHandoverRecipientEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Informace k předávané agendě – ${employeeName}`

  const reasonText = option3Reason?.trim()
    ? option3Reason.trim()
    : "dle údajů uvedených ve výstupním listu"

  const senderText = sentByName?.trim()
    ? ` Informaci odeslal(a): ${sentByName.trim()}.`
    : ""

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
          
          <tr>
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Informace k předávané agendě
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 30px;background-color:#ffffff;">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                ve výstupním listu níže uvedeného zaměstnance/zaměstnankyně
                <strong>${employeeName}</strong> jste byl(a) uveden(a) v části
                <strong>„Za dokumenty odpovídá“</strong>.
              </p>

              <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                Agenda zatím zůstává na neobsazeném funkčním místě z důvodu:
                <strong>${reasonText}</strong>.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="margin-bottom:24px;border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:150px;">
                    Zaměstnanec
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${employeeName}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Pozice
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeePosition || "—"}
                  </td>
                </tr>

                <tr style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeDepartment || "—"}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Datum odchodu
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employmentEndDate || "—"}
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                Prosíme, ověřte si v rámci svého odboru nebo s příslušným vedoucím,
                jaké konkrétní dokumenty nebo agenda se vás týkají.
              </p>

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                Tento e-mail slouží jako informativní oznámení k výstupnímu listu.
                Samotné předání dokumentů v e-spisu nebo další navazující kroky
                se řídí interním postupem.
              </p>

              ${
                senderText
                  ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">${senderText}</p>`
                  : ""
              }

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Zpráva byla odeslána prostřednictvím aplikace On-Off-Boarding ÚMČ Praha&nbsp;6.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
              Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
              V případě dotazů kontaktujte svého vedoucího nebo personální oddělení.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    `ve výstupním listu zaměstnance/zaměstnankyně ${employeeName} jste byl(a) uveden(a) v části „Za dokumenty odpovídá“.`,
    "",
    `Agenda zatím zůstává na neobsazeném funkčním místě z důvodu: ${reasonText}.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    "Prosíme, ověřte si v rámci svého odboru nebo s příslušným vedoucím, jaké konkrétní dokumenty nebo agenda se vás týkají.",
    "Tento e-mail slouží jako informativní oznámení k výstupnímu listu.",
    sentByName?.trim() ? `Informaci odeslal(a): ${sentByName.trim()}.` : "",
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

type SendExitChecklistCompletedEmailParams = {
  to: string[]
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  completedByName?: string | null
  checklistUrl: string
}

export async function sendExitChecklistCompletedEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  completedByName,
  checklistUrl,
}: SendExitChecklistCompletedEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Výstupní list je kompletně vyplněn – ${employeeName}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    Výstupní list je kompletně vyplněn
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    výstupní list zaměstnance/zaměstnankyně
                    <strong>${escapeHtml(employeeName)}</strong>
                    byl kompletně vyplněn a podepsán.
                  </p>

                  ${renderExitChecklistInfoTable({
                    primary,
                    bgLight,
                    employeeName,
                    employeePosition,
                    employeeDepartment,
                    employmentEndDate,
                    extraRows: completedByName
                      ? [
                          {
                            label: "Dokončil(a)",
                            value: completedByName,
                            strong: true,
                          },
                        ]
                      : [],
                  })}

                  <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                        <a
                          href="${escapeHtml(checklistUrl)}"
                          style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                        >
                          Otevřít výstupní list
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(checklistUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(checklistUrl)}
                    </a>
                  </p>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    `výstupní list je kompletně vyplněn – ${employeeName}`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    completedByName ? `Dokončil(a): ${completedByName}` : "",
    "",
    `Odkaz: ${checklistUrl}`,
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to, subject, html, text })
}

type SendExitChecklistPdfEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  message?: string | null
  sentByName?: string | null
  pdfBuffer: Buffer
  filename: string
}

export async function sendExitChecklistPdfEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  message,
  sentByName,
  pdfBuffer,
  filename,
}: SendExitChecklistPdfEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Výstupní list – ${employeeName}`

  const greeting = "Dobrý den,"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(subject)}</title>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    Výstupní list v příloze
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:26px 30px;background-color:#ffffff;font-family:'Civil Premium','Segoe UI',Arial,sans-serif;">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    ${escapeHtml(greeting)}
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    v příloze zasíláme PDF výstupního listu zaměstnance/zaměstnankyně:
                  </p>

                  ${renderExitChecklistInfoTable({
                    primary,
                    bgLight,
                    employeeName,
                    employeePosition,
                    employeeDepartment,
                    employmentEndDate,
                  })}

                  ${
                    message?.trim()
                      ? `<p style="margin:0 0 18px 0;padding:12px 14px;border-left:4px solid ${primary};background:#f0fdfa;font-size:14px;color:#374151;line-height:1.6;">${escapeHtml(message.trim())}</p>`
                      : ""
                  }

                  ${
                    sentByName?.trim()
                      ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">Odeslal(a): ${escapeHtml(sentByName.trim())}</p>`
                      : ""
                  }
                  </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    `v příloze zasíláme PDF výstupního listu zaměstnance/zaměstnankyně:`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    message ? `Zpráva: ${message}` : "",
    sentByName ? `Odeslal(a): ${sentByName}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: [to],
    subject,
    html,
    text,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  })
}

type SendBehalfSignatureEmailParams = {
  to: string
  behalfOfName: string
  behalfOfRole: string
  behalfOfDisplayLabel?: string
  employeeName: string
  employeePosition: string
  employeeDepartment: string
  employmentEndDate: string
  signUrl: string
}

function buildBehalfFullLabel(args: {
  behalfOfName: string
  behalfOfRole: string
  behalfOfDisplayLabel?: string
}) {
  const name = args.behalfOfName.replace(/\s+/g, " ").trim()
  const role = args.behalfOfRole.replace(/\s+/g, " ").trim()
  const displayLabel = args.behalfOfDisplayLabel?.replace(/\s+/g, " ").trim()

  if (displayLabel) return displayLabel

  if (!role) return name
  if (!name) return role

  const normalizedName = name.toLowerCase()
  const normalizedRole = role.toLowerCase()

  if (
    normalizedName === normalizedRole ||
    normalizedName.includes(normalizedRole) ||
    normalizedRole.includes(normalizedName)
  ) {
    return name
  }

  return `${role} — ${name}`
}

export async function sendBehalfSignatureEmail({
  to,
  behalfOfName,
  behalfOfRole,
  behalfOfDisplayLabel,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
}: SendBehalfSignatureEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Podpis výstupního listu v zastoupení – ${employeeName}`

  const behalfFullLabel = buildBehalfFullLabel({
    behalfOfName,
    behalfOfRole,
    behalfOfDisplayLabel,
  })

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${bgLight};font-family:'Segoe UI',Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
          <tr>
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list – zastoupení
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Žádost o podpis v zastoupení
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 30px;background-color:#ffffff;">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                byli jste vybráni jako zástupce za
                <strong>${behalfFullLabel}</strong>
                k podpisu výstupního listu zaměstnance
                <strong>${employeeName}</strong>.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="margin-bottom:24px;border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                    Zastupujete za
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${behalfFullLabel}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Zaměstnanec
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeName}
                  </td>
                </tr>

                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Pozice
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeePosition || "—"}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeDepartment || "—"}
                  </td>
                </tr>

                <tr style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Datum odchodu
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employmentEndDate || "—"}
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                Pro podpis je potřeba se přihlásit firemním Google účtem
                <strong>@praha6.cz</strong>.
                Po přihlášení budete přesměrován(a) přímo na výstupní list.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                    <a href="${signUrl}"
                      style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
                      Otevřít výstupní list
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
              </p>
              <p style="margin:0;word-break:break-all;">
                <a href="${signUrl}" style="font-family:monospace;font-size:12px;color:${primary};">
                  ${signUrl}
                </a>
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
              Tento e-mail byl automaticky vygenerován. Prosíme, neodpovídejte na tuto zprávu.
              V případě dotazů kontaktujte personální oddělení.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    `byli jste vybráni jako zástupce za ${behalfFullLabel} k podpisu výstupního listu zaměstnance ${employeeName}.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    "Pro podpis je potřeba se přihlásit firemním Google účtem @praha6.cz",
    "",
    `Odkaz: ${signUrl}`,
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
  ].join("\n")

  await sendMail({ to: [to], subject, html, text })
}
