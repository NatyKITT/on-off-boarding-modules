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

const EMAIL_FONT_FAMILY = "'Civil Premium', 'Segoe UI', Arial, sans-serif"

export const EMAIL_FOOTER_HTML = `
  Tento e-mail byl automaticky vygenerován systémem
  <strong>On-Off-Boarding Modul ÚMČ Praha&nbsp;6</strong>.<br/>
  Prosíme, neodpovídejte na tuto zprávu. V případě dotazů kontaktujte personální oddělení.
`

const EMAIL_GLOBAL_FONT_STYLE = `
        body, table, td, th, div, p, a, span {
          font-family: ${EMAIL_FONT_FAMILY};
        }
      `

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

// Notes/Outlook mají nespolehlivé chování margin na <table>. Místo margin
// se mezera vkládá jako padding na buňce obalové tabulky.
function wrapWithBottomSpacing(innerHtml: string, px: number): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 ${px}px 0;">
          ${innerHtml}
        </td>
      </tr>
    </table>
  `
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

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${rows
        .map((row, index) => {
          const isHighlighted = index === 0 || row.strong
          const bg = index % 2 === 0 ? args.bgLight : "#ffffff"

          return `
            <tr bgcolor="${bg}" style="background-color:${bg};">
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
  `,
    24
  )
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

    return wrapWithBottomSpacing(
      `
      <table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="width:100%; border-collapse: collapse; font-family: ${EMAIL_FONT_FAMILY}; font-size: 13px;">
        <thead>
          <tr bgcolor="${primary}" style="background-color: ${primary}; color: #ffffff;">
            <th align="left" style="padding: 10px; width: 220px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff; word-break: normal; overflow-wrap: normal; white-space: normal;">Zaměstnanec</th>
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff; word-break: normal; overflow-wrap: normal; white-space: normal;">Pozice</th>
            <th align="left" style="padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff; word-break: normal; overflow-wrap: normal; white-space: normal;">Odbor</th>
            <th align="left" style="padding: 10px; width: 120px; font-weight: 600; text-transform: uppercase; font-size: 11px; white-space: nowrap; color: #ffffff;">${dateHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color: ${
              i % 2 === 0 ? "#ffffff" : "#f9fafb"
            };">

              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">
                ${formatName(r)}
              </td>

              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">
                ${r.position ?? "—"}
              </td>

              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111827;">
                ${r.department ?? "—"}
              </td>

              <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums; color: #111827;">
                ${fmtDate(r.date)}
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `,
      22
    )
  }

  const renderTablePlanned = (
    rows: EmailRecord[],
    dateHeader: string
  ): string => {
    if (!rows.length) return ""

    return wrapWithBottomSpacing(
      `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%; border-collapse: collapse; font-family: ${EMAIL_FONT_FAMILY}; font-size: 13px;">
      <thead>
        <tr bgcolor="${primary}" style="background-color: ${primary}; color: #ffffff;">

          <th align="left"
              style="padding: 10px; width: 220px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
            Zaměstnanec
          </th>

          <th align="left"
              style="padding: 10px; width: 95px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
            Osobní číslo
          </th>

          <th align="left"
              style="padding: 10px; width: 200px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
            Pozice
          </th>

          <th align="left"
              style="padding: 10px; width: 190px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
            Odbor
          </th>

          <th align="left"
              style="padding: 10px; width: 105px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
            Číslo funkce
          </th>

          <th align="left"
              style="padding: 10px; width: 120px; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #ffffff;">
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

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">
              ${formatName(r)}
            </td>

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; color: #111827;">
              ${r.personalNumber ?? "—"}
            </td>

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">
              ${r.position ?? "—"}
            </td>

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111827;">
              ${r.department ?? "—"}
            </td>

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; color: #111827;">
              ${r.positionNum ?? "—"}
            </td>

            <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums; color: #111827;">
              ${fmtDate(r.date)}
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `,
      22
    )
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
        ${EMAIL_GLOBAL_FONT_STYLE}

        .card-border { border: 1px solid #d9ece7; }
        .intro-row { border-bottom: 1px solid #d9ece7; }
        .footer-row { border-top: 1px solid #d9ece7; }

        .content-pad { padding: 26px 22px !important; }

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
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important; font-family: ${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table
              class="card-shadow card-border"
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="860"
              bgcolor="#ffffff"
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
                      <td style="color: #ffffff; font-family: ${EMAIL_FONT_FAMILY};">
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
                  <td class="intro-row" bgcolor="${bgLight}" style="padding: 15px 30px; border-bottom: 1px solid #d9ece7; font-family: ${EMAIL_FONT_FAMILY}; font-size: 14px; line-height: 1.6; color: #082B2A;">
                    Vážené kolegyně, vážení kolegové, přinášíme vám aktuální informace o vzniku a ukončení pracovních poměrů v měsíci <strong>${monthLabel}</strong>.
                  </td>
                </tr>
                `
                  : ""
              }

              <tr>
                <td class="content-pad" bgcolor="#ffffff" style="padding: 26px 22px; background-color: #ffffff; font-family: ${EMAIL_FONT_FAMILY};">
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
                    font-family: ${EMAIL_FONT_FAMILY};
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
                        ${EMAIL_FOOTER_HTML}
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

function employeeChangeTypeLabel(type: EmployeeChangeEmailRecord["type"]) {
  if (type === "NAME") return "Změna jména"
  if (type === "POSITION") return "Změna pozice"
  return "Změna jména i pozice"
}

function buildEmployeeChangePositionSummary(
  record: EmployeeChangeEmailRecord,
  useNew: boolean
): string {
  const positionName = useNew
    ? (record.newPositionName ?? record.oldPositionName)
    : record.oldPositionName
  const positionNum = useNew
    ? (record.newPositionNum ?? record.oldPositionNum)
    : record.oldPositionNum
  const department = useNew
    ? (record.newDepartment ?? record.oldDepartment)
    : record.oldDepartment
  const unitName = useNew
    ? (record.newUnitName ?? record.oldUnitName)
    : record.oldUnitName

  return (
    [
      positionName || null,
      positionNum ? `č. ${positionNum}` : null,
      department || null,
      unitName || null,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

type EmployeeChangeGroup = { label: string; oldValue: string; newValue: string }

function buildEmployeeChangeGroups(
  record: EmployeeChangeEmailRecord
): EmployeeChangeGroup[] {
  const groups: EmployeeChangeGroup[] = []

  if (isEmployeeNameChange(record.type)) {
    const oldFull = formatEmployeeChangeName(record)
    const newFull = formatEmployeeChangeNewName(record)

    if (oldFull !== newFull) {
      groups.push({
        label: "Jméno",
        oldValue: oldFull || "—",
        newValue: newFull || "—",
      })
    }
  }

  if (isEmployeePositionChange(record.type)) {
    const oldSummary = buildEmployeeChangePositionSummary(record, false)
    const newSummary = buildEmployeeChangePositionSummary(record, true)

    if (oldSummary !== newSummary) {
      groups.push({
        label: "Pozice",
        oldValue: oldSummary,
        newValue: newSummary,
      })
    }
  }

  return groups
}

function renderChangeValueBubble(
  label: string,
  value: string,
  variant: "old" | "new"
) {
  const bg = variant === "old" ? "#f3f4f6" : "#E5F5F2"
  const color = variant === "old" ? "#6b7280" : "#00847C"
  const fontWeight = variant === "old" ? 400 : 700

  return `
    <div style="margin-bottom:6px;font-family:${EMAIL_FONT_FAMILY};">
      <div style="margin-bottom:2px;font-size:10px;font-weight:600;color:${variant === "old" ? "#9ca3af" : "#00847C"};">
        ${escapeHtml(label)}
      </div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
        style="border-collapse:separate;font-family:${EMAIL_FONT_FAMILY};">
        <tr>
          <td bgcolor="${bg}" style="padding:5px 10px;background-color:${bg};border-radius:8px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;font-weight:${fontWeight};color:${color};word-break:break-word;">
            ${escapeHtml(value)}
          </td>
        </tr>
      </table>
    </div>
  `
}

function renderEmployeeChangeBubbles(
  record: EmployeeChangeEmailRecord
): string {
  const groups = buildEmployeeChangeGroups(record)

  if (!groups.length) {
    return `<div style="font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">Bez detailu změny</div>`
  }

  return groups
    .map(
      (group) => `
        <div style="margin-bottom:10px;font-family:${EMAIL_FONT_FAMILY};">
          <div style="margin-bottom:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;">
            ${escapeHtml(group.label)}
          </div>
          ${renderChangeValueBubble("Původní hodnota", group.oldValue, "old")}
          ${renderChangeValueBubble("Nová hodnota", group.newValue, "new")}
        </div>
      `
    )
    .join("")
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

function renderEmployeeChangeTable(
  records: EmployeeChangeEmailRecord[],
  args: { showPersonalNumberColumn: boolean }
) {
  if (!records.length) return ""

  const { showPersonalNumberColumn } = args

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%;border-collapse:collapse;font-family:${EMAIL_FONT_FAMILY};font-size:13px;">
      <thead>
        <tr bgcolor="#00847C" style="background-color:#00847C;color:#ffffff;">
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;color:#ffffff;">Zaměstnanec</th>
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;color:#ffffff;">Typ změny</th>
          ${
            showPersonalNumberColumn
              ? `<th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;color:#ffffff;">Osobní číslo</th>`
              : ""
          }
          <th align="left" style="padding:10px;font-size:11px;text-transform:uppercase;color:#ffffff;">Změna</th>
          <th align="left" style="padding:10px;width:110px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Účinnost</th>
        </tr>
      </thead>

      <tbody>
        ${records
          .map(
            (record, index) => `
              <tr bgcolor="${index % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-weight:600;color:#111827;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                  ${
                    !showPersonalNumberColumn && record.personalNumber
                      ? `<div style="margin-top:2px;font-size:11px;font-weight:400;color:#6b7280;">#${escapeHtml(record.personalNumber)}</div>`
                      : ""
                  }
                </td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
                  ${escapeHtml(employeeChangeTypeLabel(record.type))}
                </td>
                ${
                  showPersonalNumberColumn
                    ? `<td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">${escapeHtml(record.personalNumber || "—")}</td>`
                    : ""
                }
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                  ${renderEmployeeChangeBubbles(record)}
                </td>
                <td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
                  ${escapeHtml(fmtDate(record.effectiveDate))}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `,
    24
  )
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

  const tablesHtml = renderEmployeeChangeTable(records, {
    showPersonalNumberColumn: audience === "ONBOARDING_GROUP",
  })

  const effectiveText =
    dates.length === 1
      ? `s účinností od ${dates[0]}`
      : "s účinností dle data uvedeného u jednotlivých záznamů"

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="860"
              bgcolor="#ffffff" style="max-width:860px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;border-collapse:separate;">

              <tr>
                <td bgcolor="${primary}" style="padding:24px 30px;background-color:${primary};">
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                    Personální změny
                  </div>
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:23px;font-weight:700;line-height:1.25;">
                    ${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:28px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};color:#111827;">
                  <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;">
                    Vážené kolegyně, vážení kolegové,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">
                    tímto vás informuji o následujících změnách ${escapeHtml(effectiveText)}:
                  </p>

                  ${tablesHtml}

                  ${
                    !tablesHtml
                      ? `<p style="margin:24px 0;font-size:14px;color:#6b7280;">Pro vybrané období nejsou evidované žádné změny.</p>`
                      : ""
                  }
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#4b5563;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
        ${EMAIL_GLOBAL_FONT_STYLE}
        .intro-text {
          font-family: ${EMAIL_FONT_FAMILY};
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

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table
              class="card-shadow card-border"
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr>
                <td
                  class="rounded-top"
                  bgcolor="${primary}"
                  style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;"
                >
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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
                  bgcolor="#ffffff"
                  style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};"
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

                  ${wrapWithBottomSpacing(
                    `
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                        <a
                          href="${escapeHtml(signUrl)}"
                          style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                        >
                          Otevřít výstupní list
                        </a>
                      </td>
                    </tr>
                  </table>
                  `,
                    24
                  )}

                  <p style="margin:0 0 4px 0;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">
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
                  style="padding:18px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#4b5563;line-height:1.5;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;"
                >
                  ${EMAIL_FOOTER_HTML}
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
  headerLabel?: string
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
  subject?: string | null
  intro?: string | null
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

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${rows
        .map((row, index) => {
          const bg = index % 2 === 0 ? args.bgLight : "#ffffff"
          const strong = row.strong === true

          return `
            <tr bgcolor="${bg}" style="background-color:${bg};">
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
  `,
    24
  )
}

export async function sendProbationNotificationEmail({
  to,
  subject,
  headerLabel,
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
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">

              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;opacity:.85;">
                    Zkušební doba
                  </div>
                  ${
                    headerLabel
                      ? `
                  <div style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.95;">
                    ${escapeHtml(headerLabel)}
                  </div>
                  `
                      : ""
                  }
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;white-space:nowrap;">
                    Vyhodnocení zkušební doby
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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
                    ${wrapWithBottomSpacing(
                      `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                          <a
                            href="${escapeHtml(evaluationLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít vyhodnocení
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                      24
                    )}

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
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
    subject:
      args.subject?.trim() ||
      `Vyhodnocení zkušební doby – ${args.employeeName}`,
    headerLabel: "Pozvánka",
    intro:
      args.intro?.trim() ||
      "Personální oddělení vám zaslalo odkaz k vyplnění formuláře Vyhodnocení zkušební doby.",
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
    subject:
      args.subject?.trim() ||
      `Připomínka: vyhodnocení zkušební doby – ${args.employeeName}`,
    headerLabel: "Připomínka",
    intro:
      args.intro?.trim() ||
      "Personální oddělení připomíná, že formulář Vyhodnocení zkušební doby zatím není finálně vyplněný.",
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
  subject?: string | null
  intro?: string | null
}) {
  await sendProbationNotificationEmail({
    to: args.to,
    subject:
      args.subject?.trim() ||
      `HR připomínka: nevyplněné vyhodnocení zkušební doby – ${args.employeeName}`,
    headerLabel: "Připomínka",
    intro:
      args.intro?.trim() ||
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
    headerLabel: "Upozornění",
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
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;opacity:.85;">
                    Zkušební doba
                  </div>
                  <div style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.95;">
                    PDF příloha
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;white-space:nowrap;">
                    Vyhodnocení zkušební doby
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Personální oddělení vám zasílá PDF přílohu formuláře Vyhodnocení zkušební doby níže uvedeného zaměstnance.
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
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
    "Personální oddělení vám zasílá PDF přílohu formuláře Vyhodnocení zkušební doby níže uvedeného zaměstnance.",
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
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
              <tr>
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;opacity:.85;">
                    Zkušební doba
                  </div>
                  <div style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.95;">
                    Dokončeno
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;white-space:nowrap;">
                    Vyhodnocení zkušební doby
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
      subject: payload.subject,
      intro: payload.intro,
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
      subject: payload.subject,
      intro: payload.intro,
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
      subject: payload.subject,
      intro: payload.intro,
    })

    return
  }

  if (type === "PROBATION_HR_INFO" || type === "PROBATION_EVALUATION_HR_INFO") {
    await sendProbationNotificationEmail({
      to: recipients,
      subject:
        payload.subject ||
        `Informace k vyhodnocení zkušební doby – ${employeeName}`,
      headerLabel: "Informace",
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
  <style type="text/css">
    body { margin: 0; padding: 0; }
    table { border-collapse: collapse; }
    ${EMAIL_GLOBAL_FONT_STYLE}
  </style>
</head>
<body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">

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
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:150px;">
                    Zaměstnanec
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${employeeName}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Pozice
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeePosition || "—"}
                  </td>
                </tr>

                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeDepartment || "—"}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Datum odchodu
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employmentEndDate || "—"}
                  </td>
                </tr>
              </table>
              `,
                24
              )}

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
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
              ${EMAIL_FOOTER_HTML}
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
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
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
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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

                  ${wrapWithBottomSpacing(
                    `
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                        <a
                          href="${escapeHtml(checklistUrl)}"
                          style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                        >
                          Otevřít výstupní list
                        </a>
                      </td>
                    </tr>
                  </table>
                  `,
                    24
                  )}

                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(checklistUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(checklistUrl)}
                    </a>
                  </p>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
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
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
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
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
                  ${EMAIL_FOOTER_HTML}
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
  <style type="text/css">
    body { margin: 0; padding: 0; }
    table { border-collapse: collapse; }
    ${EMAIL_GLOBAL_FONT_STYLE}
  </style>
</head>
<body style="margin:0;padding:0;background-color:${bgLight};font-family:${EMAIL_FONT_FAMILY};">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600"
          bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;">
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
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                byli jste vybráni jako zástupce za
                <strong>${behalfFullLabel}</strong>
                k podpisu výstupního listu zaměstnance
                <strong>${employeeName}</strong>.
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                    Zastupujete za
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${behalfFullLabel}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Zaměstnanec
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeName}
                  </td>
                </tr>

                <tr bgcolor="#f9fafb" style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Pozice
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeePosition || "—"}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employeeDepartment || "—"}
                  </td>
                </tr>

                <tr bgcolor="#f9fafb" style="background-color:#f9fafb;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Datum odchodu
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${employmentEndDate || "—"}
                  </td>
                </tr>
              </table>
              `,
                24
              )}

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                Pro podpis je potřeba se přihlásit firemním Google účtem
                <strong>@praha6.cz</strong>.
                Po přihlášení budete přesměrován(a) přímo na výstupní list.
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                    <a href="${signUrl}"
                      style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;">
                      Otevřít výstupní list
                    </a>
                  </td>
                </tr>
              </table>
              `,
                24
              )}

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
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;">
              ${EMAIL_FOOTER_HTML}
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
