import type { MailJobStatus, MailJobType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Resend } from "resend"

import { buildCalendarLinksHtml, buildIcsCalendar } from "@/lib/calendar-link"
import { formatDayCountCs } from "@/lib/dates"
import { prisma } from "@/lib/db"
import { getEmployeeChangeDetailLabel } from "@/lib/employment-linking"
import type { ExitChecklistUnresolvedItem } from "@/lib/exit-checklist"
import {
  EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
  EXIT_CHECKLIST_MANAGER_SECTIONS,
  type ExitChecklistRoleSection,
} from "@/lib/exit-checklist-role-notes"
import { joinNameWithTitles } from "@/lib/format-name"

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
  <p style="margin: 0; font-size: 12px; color: #e5f5f2; line-height: 1.5; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">
    Tento e-mail byl automaticky vygenerován systémem
    <strong>On-Off-Boarding Modul ÚMČ Praha&nbsp;6</strong>.<br/>
    Prosíme, neodpovídejte na tuto zprávu. V případě dotazů kontaktujte Personální oddělení.
  </p>
`

const EMAIL_GLOBAL_FONT_STYLE = `
        :root {
          color-scheme: light;
          supported-color-schemes: light;
        }
        body, table, td, th, div, p, a, span {
          font-family: ${EMAIL_FONT_FAMILY};
        }
        [bgcolor="#00847C"], [bgcolor="#00847C"] * {
          color: #ffffff !important;
        }
        @media (prefers-color-scheme: dark) {
          [bgcolor="#00847C"], [bgcolor="#00847C"] * {
            background-color: #00847C !important;
            color: #ffffff !important;
          }
        }
        [data-ogsc] [bgcolor="#00847C"], [data-ogsc] [bgcolor="#00847C"] * {
          background-color: #00847C !important;
          color: #ffffff !important;
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
  return joinNameWithTitles(r)
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

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—"

  const dt = d instanceof Date ? d : new Date(d)

  if (Number.isNaN(dt.getTime())) return "—"

  return format(dt, "dd.MM.yyyy HH:mm")
}

function toIsoDateOnly(d: string | Date | null | undefined): string | null {
  if (!d) return null

  if (typeof d === "string") {
    const czech = d.trim().match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/)
    if (czech) {
      const [, day, month, year] = czech
      return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`
    }
  }

  const dt = d instanceof Date ? d : new Date(d.trim())

  if (Number.isNaN(dt.getTime())) return null

  return format(dt, "yyyy-MM-dd")
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderMultilineHtml(value: string): string {
  return value
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>")
}

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
    raw?: boolean
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
                ${row.raw ? row.value || "—" : escapeHtml(row.value || "—")}
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

function renderExitChecklistUnresolvedAlertHtml(
  items: ExitChecklistUnresolvedItem[]
): string {
  if (items.length === 0) return ""

  const rows = items
    .map((item) => {
      const signedInfo = item.signedAt
        ? `${escapeHtml(item.signedByName || "—")} · ${fmtDateTime(item.signedAt)}`
        : "Ještě nepodepsáno"

      const additionalHtml = item.additionalNote
        ? `<div style="margin-top:6px;padding:6px 10px;background-color:#FEF3E2;border:1px solid #FBD9A5;border-radius:6px;font-size:12px;color:#92400E;">
             <strong>Dodatečně vyřízeno:</strong> ${escapeHtml(item.additionalNote)}${
               item.additionallyResolvedByName
                 ? ` (${escapeHtml(item.additionallyResolvedByName)}${
                     item.additionallyResolvedAt
                       ? `, ${fmtDateTime(item.additionallyResolvedAt)}`
                       : ""
                   })`
                 : ""
             }
           </div>`
        : ""

      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #FCA5A5;background-color:#FEF2F2;">
            <div style="font-weight:600;font-size:13px;color:#7F1D1D;">${escapeHtml(item.label)}</div>
            <div style="font-size:11px;color:#9B2C2C;">${escapeHtml(item.organization)} · ${signedInfo}</div>
            ${item.note ? `<div style="margin-top:4px;font-size:12px;color:#7F1D1D;">${escapeHtml(item.note)}</div>` : ""}
            ${additionalHtml}
          </td>
        </tr>`
    })
    .join("")

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #FCA5A5;border-radius:8px;overflow:hidden;border-collapse:separate;">
      <tr>
        <td style="padding:10px 14px;background-color:#FEE2E2;border-bottom:1px solid #FCA5A5;">
          <strong style="font-size:13px;color:#7F1D1D;">Nesplněná agenda (odpověď „Ne“)</strong>
        </td>
      </tr>
      ${rows}
    </table>
    `,
    24
  )
}

function renderExitChecklistUnresolvedAlertText(
  items: ExitChecklistUnresolvedItem[]
): string[] {
  if (items.length === 0) return []

  return [
    "NESPLNĚNÁ AGENDA (odpověď „Ne“):",
    ...items.flatMap((item) => {
      const signedInfo = item.signedAt
        ? `${item.signedByName || "—"}, ${fmtDateTime(item.signedAt)}`
        : "ještě nepodepsáno"

      return [
        `- ${item.label} (${item.organization}) – ${signedInfo}`,
        item.note ? `  Poznámka: ${item.note}` : "",
        item.additionalNote
          ? `  Dodatečně vyřízeno: ${item.additionalNote}${
              item.additionallyResolvedByName
                ? ` (${item.additionallyResolvedByName}${
                    item.additionallyResolvedAt
                      ? `, ${fmtDateTime(item.additionallyResolvedAt)}`
                      : ""
                  })`
                : ""
            }`
          : "",
      ].filter(Boolean)
    }),
    "",
  ]
}

function renderPlainInfoTableHtml(
  rows: Array<{ label: string; value: string }>,
  bgLight = "#E5F5F2"
): string {
  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${rows
        .map((row, index) => {
          const bg = index % 2 === 0 ? bgLight : "#ffffff"

          return `
            <tr bgcolor="${bg}" style="background-color:${bg};">
              <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                ${escapeHtml(row.label)}
              </td>
              <td style="padding:10px 16px;font-size:14px;line-height:1.4;color:#082B2A;font-weight:700;">
                ${escapeHtml(row.value)}
              </td>
            </tr>
          `
        })
        .join("")}
    </table>
  `,
    16
  )
}

function renderBehalfPersonTableHtml(args: {
  nameLabel?: string
  name: string
  position?: string | null
  department?: string | null
}): string {
  return renderPlainInfoTableHtml([
    { label: args.nameLabel ?? "Zástupce", value: args.name },
    { label: "Funkce", value: args.position || "—" },
    { label: "Odbor/oddělení", value: args.department || "—" },
  ])
}

function buildExitChecklistInviteTitle(args: {
  roleLabel?: string | null
  isPureBehalf?: boolean
  hasSubstituteInfo?: boolean
  hasAlsoActingOnBehalfOf?: boolean
}): string {
  const rolePart = args.isPureBehalf
    ? "k podpisu v zastoupení"
    : args.roleLabel
      ? `k podpisu – ${args.roleLabel}`
      : null

  const extras: string[] = []
  if (args.hasSubstituteInfo) extras.push("přiřazení zástupu k vaší agendě")
  if (args.hasAlsoActingOnBehalfOf) extras.push("přidělení k podpisu v zástupu")

  const base = rolePart ? `Pozvánka ${rolePart}` : "Pozvánka"

  if (extras.length === 0) {
    return rolePart ? base : "Pozvánka k podpisu"
  }

  return `${base} a oznámení o ${extras.join(" a o ")}`
}

function buildExitChecklistInviteSubject(args: {
  employeeName: string
  roleLabel?: string | null
  isPureBehalf?: boolean
  hasSubstituteInfo?: boolean
  hasAlsoActingOnBehalfOf?: boolean
}): string {
  const rolePart = args.isPureBehalf
    ? "k podpisu výstupního listu v zastoupení"
    : args.roleLabel
      ? `k podpisu výstupního listu – ${args.roleLabel}`
      : "k podpisu výstupního listu"

  const extras: string[] = []
  if (args.hasSubstituteInfo) extras.push("přiřazení zástupu k vaší agendě")
  if (args.hasAlsoActingOnBehalfOf) extras.push("přidělení k podpisu v zástupu")

  let base = `Pozvánka ${rolePart}`
  if (extras.length > 0) {
    base += ` a oznámení o ${extras.join(" a o ")}`
  }

  return `${base} – ${args.employeeName}`
}

function exitChecklistReminderDaysSuffix(daysBeforeEnd: number): string {
  return daysBeforeEnd <= 0
    ? "poslední den"
    : `zbývá: ${formatDayCountCs(daysBeforeEnd)}`
}

function buildExitChecklistReminderTitle(args: {
  daysBeforeEnd: number
  isEmployee?: boolean
  isManager?: boolean
  isBehalf?: boolean
}): string {
  const base = args.isEmployee
    ? "Připomínka k podpisu vlastního výstupního listu"
    : args.isManager && args.isBehalf
      ? "Připomínka k nepodepsané agendě v zastoupení za vedoucího odboru"
      : args.isManager
        ? "Připomínka vedoucímu odboru k nepodepsané agendě"
        : args.isBehalf
          ? "Připomínka k nepodepsané agendě v zastoupení"
          : "Připomínka k nepodepsané agendě"

  return `${base} (${exitChecklistReminderDaysSuffix(args.daysBeforeEnd)})`
}

function buildExitChecklistReminderSubject(args: {
  employeeName: string
  daysBeforeEnd: number
  isEmployee?: boolean
  isManager?: boolean
  isBehalf?: boolean
}): string {
  const rolePart = args.isEmployee
    ? "k podpisu vlastního výstupního listu"
    : args.isManager && args.isBehalf
      ? "k nepodepsané agendě výstupního listu v zastoupení za vedoucího odboru"
      : args.isManager
        ? "vedoucímu odboru k nepodepsané agendě výstupního listu"
        : args.isBehalf
          ? "k nepodepsané agendě výstupního listu v zastoupení"
          : "k nepodepsané agendě výstupního listu"

  return `Připomínka ${rolePart} (${exitChecklistReminderDaysSuffix(args.daysBeforeEnd)}) – ${args.employeeName}`
}

function renderBehalfNoteHtml(): string {
  return renderInfoBubbleHtml({
    bgLight: "#fef3c7",
    borderColor: "#fde68a",
    titleColor: "#92400e",
    title: "Poznámka",
    bodyHtml: `
    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
      Podpis pro tento zástup prosím proveďte výhradně přes tlačítko
      „Podepsat v zastoupení" v aplikaci, nejedná se o podpis vlastní
      agendy.
    </p>
    `,
  })
}

function renderLoginInfoBubbleHtml(args: { signUrl: string }): string {
  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px 0;">
    <tr>
      <td style="background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;font-family:${EMAIL_FONT_FAMILY};">
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#1D4ED8;">
          Přihlášení a podpis
        </p>
        <p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#1D4ED8;">
          Přihlaste se svým firemním účtem Google (<strong>@praha6.cz</strong>).
          Po přihlášení budete přesměrováni na konkrétní výstupní list, kde
          můžete doplnit potvrzení a elektronický podpis.
        </p>
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
          <tr>
            <td bgcolor="#00847C" style="border-radius:6px;background-color:#00847C;">
              <a
                href="${escapeHtml(args.signUrl)}"
                style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
              >
                Otevřít výstupní list
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 4px 0;font-size:12px;color:#1D4ED8;">
          Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
        </p>
        <p style="margin:0;word-break:break-all;">
          <a href="${escapeHtml(args.signUrl)}" style="font-family:monospace;font-size:12px;color:#1D4ED8;">
            ${escapeHtml(args.signUrl)}
          </a>
        </p>
      </td>
    </tr>
  </table>
  `
}

function renderAppLoginInfoBoxHtml(text: string): string {
  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;">
    <tr>
      <td style="background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:16px;font-family:${EMAIL_FONT_FAMILY};">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#1D4ED8;">
          ${escapeHtml(text)}
        </p>
      </td>
    </tr>
  </table>
  `
}

const MEDICAL_EXAM_STEP_COLORS = [
  "#00847C",
  "#1D4ED8",
  "#B45309",
  "#BE185D",
  "#15803D",
]

function renderMedicalExamStepsCardHtml(
  sections: ExitChecklistRoleSection[]
): string {
  const BADGE_SIZE = 30

  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
    style="border:1px solid #d9ece7;border-radius:12px;overflow:hidden;border-collapse:separate;background-color:#ffffff;">
    ${sections
      .map((section, index) => {
        const color =
          MEDICAL_EXAM_STEP_COLORS[index % MEDICAL_EXAM_STEP_COLORS.length]
        const isLast = index === sections.length - 1

        return `
      <tr>
        <td style="padding:16px 18px;${isLast ? "" : "border-bottom:1px solid #eef2f1;"}background-color:#ffffff;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;">
            <tr>
              <td width="${BADGE_SIZE + 14}" valign="top" style="width:${BADGE_SIZE + 14}px;padding:0;">
                <table border="0" cellpadding="0" cellspacing="0" width="${BADGE_SIZE}" height="${BADGE_SIZE}" style="width:${BADGE_SIZE}px;height:${BADGE_SIZE}px;">
                  <tr>
                    <td width="${BADGE_SIZE}" height="${BADGE_SIZE}" align="center" valign="middle" style="width:${BADGE_SIZE}px;height:${BADGE_SIZE}px;border-radius:50%;background-color:${color};font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:13px;font-weight:700;line-height:${BADGE_SIZE}px;text-align:center;">${index + 1}</td>
                  </tr>
                </table>
              </td>
              <td valign="top" style="padding:0;">
                <div style="font-family:${EMAIL_FONT_FAMILY};font-size:14px;font-weight:700;color:#082B2A;margin:0 0 4px 0;line-height:1.4;">
                  ${escapeHtml(section.title)}
                </div>
                <div style="font-family:${EMAIL_FONT_FAMILY};font-size:13px;color:#4B5563;line-height:1.55;">
                  ${escapeHtml(section.description)}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      `
      })
      .join("")}
  </table>
  `
}

const EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS = EXIT_CHECKLIST_MANAGER_SECTIONS.map(
  (section) =>
    `${section.title} – ${section.description.charAt(0).toLowerCase()}${section.description.slice(1)}`
)

function renderAgendaItemsBoxHtml(
  intro: string,
  items: string[],
  bgLight: string
): string {
  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
    <tr>
      <td style="background-color:${bgLight};border:1px solid #bfe3dc;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#082B2A;">
          ${escapeHtml(intro)}
        </p>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#374151;">
          ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </td>
    </tr>
  </table>
  `
}

function agendaItemsTextLines(intro: string, items: string[]): string[] {
  return [intro, ...items.map((item) => `- ${item}`), ""]
}

function renderInfoBubbleHtml(args: {
  bgLight: string
  borderColor?: string
  titleColor?: string
  title: string
  introHtml?: string
  rows?: Array<{ label: string; value: string }>
  bodyHtml?: string
}) {
  const borderColor = args.borderColor ?? "#bfe3dc"
  const titleColor = args.titleColor ?? "#082B2A"

  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
    <tr>
      <td style="background-color:${args.bgLight};border:1px solid ${borderColor};border-radius:8px;padding:14px 16px;font-family:${EMAIL_FONT_FAMILY};">
        <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:${titleColor};">
          ${escapeHtml(args.title)}
        </p>
        ${args.introHtml ?? ""}
        ${
          args.rows?.length
            ? `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px 0;border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
          ${args.rows
            .map(
              (row, index) => `
          <tr bgcolor="${index % 2 === 0 ? args.bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? args.bgLight : "#ffffff"};">
            <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">${escapeHtml(row.label)}</td>
            <td style="padding:10px 16px;font-size:14px;line-height:1.4;color:#082B2A;font-weight:700;">${escapeHtml(row.value)}</td>
          </tr>
          `
            )
            .join("")}
        </table>
        `
            : ""
        }
        ${args.bodyHtml ?? ""}
      </td>
    </tr>
  </table>
  `
}

function plannedScopeLabel(hasOnboarding: boolean, hasOffboarding: boolean) {
  if (hasOnboarding && hasOffboarding) return "předpokládané nástupy a odchody"
  if (hasOffboarding) return "předpokládané odchody"
  return "předpokládané nástupy"
}

function plannedScopeLabelWithChanges(
  hasOnboarding: boolean,
  hasOffboarding: boolean,
  hasChanges: boolean
): string {
  const parts: string[] = []
  if (hasOnboarding) parts.push("nástupy")
  if (hasOffboarding) parts.push("odchody")
  if (hasChanges) parts.push("změny")

  if (parts.length === 0) return "předpokládané změny"
  if (parts.length === 1) return `předpokládané ${parts[0]}`

  return `předpokládané ${parts.slice(0, -1).join(", ")} a ${parts[parts.length - 1]}`
}

function formatSingleMonthLabel(month: string): string {
  return format(new Date(`${month}-01T00:00:00`), "LLLL yyyy", { locale: cs })
}

function formatMonthOnlyLabel(month: string): string {
  return format(new Date(`${month}-01T00:00:00`), "LLLL", { locale: cs })
}

function formatMonthList(months: string[]): string {
  const sorted = [...months].sort()

  if (sorted.length <= 1) {
    return `v měsíci ${sorted[0] ? formatSingleMonthLabel(sorted[0]) : ""}`
  }

  const years = new Set(sorted.map((m) => m.slice(0, 4)))

  if (years.size > 1) {
    const labels = sorted.map(formatSingleMonthLabel)
    return `v měsících ${labels.slice(0, -1).join(", ")} a ${labels[labels.length - 1]}`
  }

  const year = sorted[0].slice(0, 4)
  const labels = sorted.map(formatMonthOnlyLabel)

  return `v měsících ${labels.slice(0, -1).join(", ")} a ${labels[labels.length - 1]} ${year}`
}

function groupByMonthKey<T>(
  rows: T[],
  getDate: (row: T) => string | Date | null
): [string, T[]][] {
  const map = new Map<string, T[]>()

  for (const row of rows) {
    const value = getDate(row)
    const key = value ? format(new Date(value), "yyyy-MM") : "neuvedeno"

    const list = map.get(key)
    if (list) {
      list.push(row)
    } else {
      map.set(key, [row])
    }
  }

  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

function reportIntroTopic(args: {
  hasOnboarding: boolean
  hasOffboarding: boolean
  hasChanges: boolean
  kind: "planned" | "actual"
}): string {
  const { hasOnboarding, hasOffboarding, hasChanges, kind } = args
  const isPlanned = kind === "planned"

  if (hasOnboarding && hasOffboarding && !hasChanges) {
    return isPlanned
      ? "předpokládaném vzniku a ukončení pracovních poměrů"
      : "vzniku a ukončení pracovních poměrů"
  }

  if (hasOnboarding && !hasOffboarding && !hasChanges) {
    return isPlanned
      ? "předpokládaném vzniku pracovních poměrů"
      : "vzniku pracovních poměrů"
  }

  if (hasOffboarding && !hasOnboarding && !hasChanges) {
    return isPlanned
      ? "předpokládaném ukončení pracovních poměrů"
      : "ukončení pracovních poměrů"
  }

  return "personálních změnách"
}

function buildReportIntroSentenceHtml(args: {
  hasOnboarding: boolean
  hasOffboarding: boolean
  hasChanges: boolean
  kind: "planned" | "actual"
  months: string[]
}): string {
  const topic = reportIntroTopic(args)
  const monthPhrase = formatMonthList(args.months)

  return `přinášíme vám aktuální informace o ${escapeHtml(topic)} <strong>${escapeHtml(monthPhrase)}</strong>.`
}

type ReportPresence = "none" | "planned" | "actual" | "mixed"

function presenceOf(hasPlanned: boolean, hasActual: boolean): ReportPresence {
  if (hasPlanned && hasActual) return "mixed"
  if (hasPlanned) return "planned"
  if (hasActual) return "actual"
  return "none"
}

function combinedReportIntroTopic(args: {
  hasOnboarding: boolean
  hasOffboarding: boolean
  hasChanges: boolean
  isPlanned: boolean
}): string {
  const { hasOnboarding, hasOffboarding, hasChanges, isPlanned } = args

  if (hasChanges) {
    return isPlanned
      ? "předpokládaných personálních změnách"
      : "personálních změnách"
  }

  const modifier = isPlanned ? "předpokládaném " : ""

  if (hasOnboarding && hasOffboarding)
    return `${modifier}vzniku a ukončení pracovních poměrů`
  if (hasOffboarding) return `${modifier}ukončení pracovních poměrů`

  return `${modifier}vzniku pracovních poměrů`
}

function buildCombinedIntroSentence(args: {
  hasOnboarding: boolean
  hasOffboarding: boolean
  hasChanges: boolean
  months: string[]
  overallKind: "planned" | "actual" | "mixed"
}): string {
  const topic = combinedReportIntroTopic({
    ...args,
    isPlanned: args.overallKind === "planned",
  })
  const monthPhrase = formatMonthList(args.months)

  return `přinášíme vám aktuální informace o ${topic} ${monthPhrase}.`
}

function buildCombinedIntroSentenceHtml(args: {
  hasOnboarding: boolean
  hasOffboarding: boolean
  hasChanges: boolean
  months: string[]
  overallKind: "planned" | "actual" | "mixed"
}): string {
  const topic = combinedReportIntroTopic({
    ...args,
    isPlanned: args.overallKind === "planned",
  })
  const monthPhrase = formatMonthList(args.months)

  return `přinášíme vám aktuální informace o ${escapeHtml(topic)} <strong>${escapeHtml(monthPhrase)}</strong>.`
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

function buildEmailRecordCalendarEvent(r: EmailRecord) {
  const iso = toIsoDateOnly(r.date)
  if (!iso) return null

  const kind = r.type === "onboarding" ? "Nástup" : "Odchod"

  return {
    title: `${kind} – ${formatName(r)}`,
    description: [r.position, r.department].filter(Boolean).join(", "),
    date: iso,
  }
}

export function buildEmailRecordsIcsAttachment(
  records: EmailRecord[],
  filename = "udalosti.ics"
): { filename: string; content: Buffer; contentType: string } | null {
  const events = records
    .map((r) => buildEmailRecordCalendarEvent(r))
    .filter((e): e is NonNullable<typeof e> => e !== null)

  if (!events.length) return null

  return {
    filename,
    content: Buffer.from(buildIcsCalendar(events), "utf-8"),
    contentType: "text/calendar",
  }
}

function renderNastupyOdchodyTableActual(
  rows: EmailRecord[],
  dateHeader: string
): string {
  if (!rows.length) return ""

  return wrapWithBottomSpacing(
    `
      <table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="width:100%; border-collapse: collapse; font-family: ${EMAIL_FONT_FAMILY}; font-size:13px;">
        <thead>
          <tr bgcolor="#00847C" style="background-color: #00847C; color: #ffffff;">
            <th align="left" style="padding: 13px; width: 220px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">Zaměstnanec</th>
            <th align="left" style="padding: 13px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">Pozice</th>
            <th align="left" style="padding: 13px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">Odbor</th>
            <th align="left" style="padding: 13px; width: 120px; font-weight: 600; text-transform: uppercase; font-size:11px; white-space: nowrap; color: #ffffff;">${dateHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              return `
            <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color: ${
              i % 2 === 0 ? "#ffffff" : "#f9fafb"
            };">

              <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">
                ${formatName(r)}
              </td>

              <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; color: #111827;">
                ${r.position ?? "—"}
              </td>

              <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111827;">
                ${r.department ?? "—"}
              </td>

              <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums; color: #111827;">
                ${fmtDate(r.date)}
              </td>
            </tr>
          `
            })
            .join("")}
        </tbody>
      </table>
    `,
    22
  )
}

function renderNastupyOdchodyTablePlanned(
  rows: EmailRecord[],
  dateHeader: string
): string {
  if (!rows.length) return ""

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="width:100%; border-collapse: collapse; font-family: ${EMAIL_FONT_FAMILY}; font-size:13px;">
      <thead>
        <tr bgcolor="#00847C" style="background-color: #00847C; color: #ffffff;">

          <th align="left"
              style="padding: 13px; width: 220px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">
            Zaměstnanec
          </th>

          <th align="left"
              style="padding: 13px; width: 95px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff;">
            Osobní číslo
          </th>

          <th align="left"
              style="padding: 13px; width: 105px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff;">
            Číslo funkce
          </th>

          <th align="left"
              style="padding: 13px; width: 200px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">
            Pozice
          </th>

          <th align="left"
              style="padding: 13px; width: 190px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff; white-space: normal;">
            Odbor
          </th>

          <th align="left"
              style="padding: 13px; width: 120px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff;">
            ${dateHeader}
          </th>

          <th align="left"
              style="padding: 13px; width: 120px; font-weight: 600; text-transform: uppercase; font-size:11px; color: #ffffff;">
            Kalendář
          </th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r, i) => {
            const calendarEvent = buildEmailRecordCalendarEvent(r)

            return `
          <tr bgcolor="${i % 2 === 0 ? "#ffffff" : "#f9fafb"}"
              style="background-color: ${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">
              ${formatName(r)}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; color: #111827;">
              ${r.personalNumber ?? "—"}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; color: #111827;">
              ${r.positionNum ?? "—"}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; color: #111827;">
              ${r.position ?? "—"}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111827;">
              ${r.department ?? "—"}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; font-variant-numeric: tabular-nums; color: #111827;">
              ${fmtDate(r.date)}
            </td>

            <td style="padding: 13px; border-bottom: 1px solid #e5e7eb; white-space: nowrap;">
              ${calendarEvent ? buildCalendarLinksHtml(calendarEvent) : "—"}
            </td>
          </tr>
        `
          })
          .join("")}
      </tbody>
    </table>
  `,
    22
  )
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

  const renderTable =
    kind === "planned"
      ? renderNastupyOdchodyTablePlanned
      : renderNastupyOdchodyTableActual

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

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${subtitle} – ${monthLabel}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important; font-family: ${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="860"
              bgcolor="#ffffff"
              style="
                max-width: 860px;
                background-color: #ffffff;
                border-collapse: separate;
                border: 1px solid #d9ece7;
                border-radius: 12px;
                overflow: hidden;
              "
            >
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:24px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                    Personální změny
                  </div>
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:23px;font-weight:700;line-height:1.25;white-space:nowrap;">
                    ${subtitle} – ${monthLabel}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding: 15px 30px; border-bottom: 1px solid #d9ece7; font-family: ${EMAIL_FONT_FAMILY}; font-size: 14px; line-height: 1.6; color: #082B2A;">
                  <p style="margin:0 0 12px 0;">Vážené kolegyně, vážení kolegové,</p>
                  <p style="margin:0;">${buildReportIntroSentenceHtml({
                    hasOnboarding,
                    hasOffboarding,
                    hasChanges: false,
                    kind: kind === "planned" ? "planned" : "actual",
                    months: [month],
                  })}</p>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding: 26px 22px; background-color: #ffffff; font-family: ${EMAIL_FONT_FAMILY};">
                  ${
                    onboardings.length
                      ? `
                    <h2 style="font-size:16px; color: #111827; margin: 0 0 4px 0; font-weight: 700;">${onboardingTitle}</h2>
                    <p style="font-size:12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4;">${onboardingNote}</p>
                    ${renderTable(onboardings, onboardingDateHeader)}
                    `
                      : ""
                  }

                  ${
                    offboardings.length
                      ? `
                    <h2 style="font-size:16px; color: #111827; margin: 18px 0 4px 0; font-weight: 700;">${offboardingTitle}</h2>
                    <p style="font-size:12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4;">${offboardingNote}</p>
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
                  bgcolor="${primary}"
                  style="
                    padding: 18px 26px;
                    font-family: ${EMAIL_FONT_FAMILY};
                    font-size:12px;
                    color: #e5f5f2;
                    line-height: 1.5;
                    border-top: 1px solid ${primary};
                    border-radius: 0 0 12px 12px;
                  "
                >
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

export type EmployeeChangeEmailRecord = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION" | "MATERNITY_LEAVE"
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

export type EmployeeChangeReportAudience =
  | "ONBOARDING_GROUP"
  | "ALL_EMPLOYEES"
  | "CUSTOM_EMAIL"

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

function formatEmployeeChangeOldName(record: EmployeeChangeEmailRecord) {
  return [
    record.oldTitleBefore,
    record.oldName,
    record.oldSurname,
    record.oldTitleAfter,
  ]
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

function buildEmployeeChangePositionSummary(
  record: EmployeeChangeEmailRecord,
  useNew: boolean,
  options?: { includePositionNum?: boolean }
): string {
  const includePositionNum = options?.includePositionNum ?? true

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
      includePositionNum && positionNum ? `č. ${positionNum}` : null,
      department || null,
      unitName || null,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  )
}

type EmployeeChangeGroup = { label: string; newValue: string }

function buildEmployeeChangeGroups(
  record: EmployeeChangeEmailRecord
): EmployeeChangeGroup[] {
  const groups: EmployeeChangeGroup[] = []

  if (isEmployeeNameChange(record.type)) {
    const oldFull = formatEmployeeChangeOldName(record)
    const newFull = formatEmployeeChangeNewName(record)

    if (oldFull !== newFull) {
      groups.push({
        label: "Jméno",
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
        newValue: newSummary,
      })
    }
  }

  return groups
}

function renderNewValueBox(fieldLabel: string, value: string) {
  return `
    <div style="display:inline-block;width:100%;box-sizing:border-box;background-color:#E5F5F2;border:1px solid #00847C;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-family:${EMAIL_FONT_FAMILY};-webkit-text-size-adjust:100%;text-size-adjust:100%;">
      <div style="margin-bottom:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#00847C;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
        Nová hodnota – ${escapeHtml(fieldLabel)}
      </div>
      <div style="font-size:12px;font-weight:700;color:#00847C;word-break:break-word;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
        ${escapeHtml(value)}
      </div>
    </div>
  `
}

function renderEmployeeChangeBubbles(
  record: EmployeeChangeEmailRecord
): string {
  if (record.type === "MATERNITY_LEAVE") {
    return `
      <div style="display:inline-block;background-color:#E5F5F2;border:1px solid #00847C;border-radius:8px;padding:8px 10px;font-family:${EMAIL_FONT_FAMILY};">
        <div style="margin-bottom:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#00847C;">
          Nová hodnota
        </div>
        <div style="font-size:12px;font-weight:700;color:#00847C;">
          Odchod na mateřskou dovolenou
        </div>
      </div>
    `
  }

  const groups = buildEmployeeChangeGroups(record)

  if (!groups.length) {
    return `<div style="font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">Bez detailu změny</div>`
  }

  return groups
    .map((group) => renderNewValueBox(group.label, group.newValue))
    .join("")
}

function buildEmployeeChangeCalendarEvent(record: EmployeeChangeEmailRecord) {
  if (record.type !== "MATERNITY_LEAVE") return null

  const iso = toIsoDateOnly(record.effectiveDate)
  if (!iso) return null

  return {
    title: `Odchod na mateřskou dovolenou – ${formatEmployeeChangeName(record)}`,
    description: buildEmployeeChangePositionSummary(record, false),
    date: iso,
  }
}

export function buildCombinedReportIcsAttachment(
  args: {
    records?: EmailRecord[]
    changes?: EmployeeChangeEmailRecord[]
  },
  filename = "udalosti-report.ics"
): { filename: string; content: Buffer; contentType: string } | null {
  const events = [
    ...(args.records ?? [])
      .map((r) => buildEmailRecordCalendarEvent(r))
      .filter((e): e is NonNullable<typeof e> => e !== null),
    ...(args.changes ?? [])
      .map((r) => buildEmployeeChangeCalendarEvent(r))
      .filter((e): e is NonNullable<typeof e> => e !== null),
  ]

  if (!events.length) return null

  return {
    filename,
    content: Buffer.from(buildIcsCalendar(events), "utf-8"),
    contentType: "text/calendar",
  }
}

export function buildEmployeeChangeRecordsIcsAttachment(
  records: EmployeeChangeEmailRecord[],
  filename = "udalosti-zmeny.ics"
): { filename: string; content: Buffer; contentType: string } | null {
  const events = records
    .map((r) => buildEmployeeChangeCalendarEvent(r))
    .filter((e): e is NonNullable<typeof e> => e !== null)

  if (!events.length) return null

  return {
    filename,
    content: Buffer.from(buildIcsCalendar(events), "utf-8"),
    contentType: "text/calendar",
  }
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

  const COL_EMPLOYEE = 200
  const COL_PERSONAL_NUMBER = 90
  const COL_POSITION_NUM = 90
  const COL_TYPE = 230
  const COL_CHANGE = 190
  const COL_EFFECTIVE = 95

  let totalWidth =
    COL_EMPLOYEE + COL_POSITION_NUM + COL_TYPE + COL_CHANGE + COL_EFFECTIVE
  if (showPersonalNumberColumn) totalWidth += COL_PERSONAL_NUMBER

  return wrapWithBottomSpacing(
    `
    <div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table class="eml-change-table" border="0" cellpadding="0" cellspacing="0" width="${totalWidth}"
      style="border-collapse:collapse;table-layout:fixed;width:${totalWidth}px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;">
      <thead>
        <tr bgcolor="#00847C" style="background-color:#00847C;color:#ffffff;">
          <th align="left" style="box-sizing:border-box;padding:13px;width:${COL_EMPLOYEE}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:normal;">Zaměstnanec</th>
          ${
            showPersonalNumberColumn
              ? `<th align="left" style="box-sizing:border-box;padding:13px;width:${COL_PERSONAL_NUMBER}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Osobní číslo</th>`
              : ""
          }
          <th align="left" style="box-sizing:border-box;padding:13px;width:${COL_POSITION_NUM}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Číslo funkce</th>
          <th align="left" style="box-sizing:border-box;padding:13px;width:${COL_TYPE}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:normal;">Typ změny</th>
          <th align="left" style="box-sizing:border-box;padding:13px;width:${COL_CHANGE}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:normal;">Změna</th>
          <th align="left" style="box-sizing:border-box;padding:13px;width:${COL_EFFECTIVE}px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Účinnost</th>
        </tr>
      </thead>

      <tbody>
        ${records
          .map((record, index) => {
            const assignmentSummary = buildEmployeeChangePositionSummary(
              record,
              false,
              { includePositionNum: false }
            )
            const positionNum = record.newPositionNum ?? record.oldPositionNum

            return `
              <tr bgcolor="${index % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">
                <td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-weight:600;color:#111827;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                  ${
                    !showPersonalNumberColumn && record.personalNumber
                      ? `<div style="margin-top:2px;font-size:11px;font-weight:400;color:#6b7280;">#${escapeHtml(record.personalNumber)}</div>`
                      : ""
                  }
                  ${
                    assignmentSummary && assignmentSummary !== "—"
                      ? `<div style="margin-top:6px;background-color:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:11px;font-weight:400;color:#4b5563;">${escapeHtml(assignmentSummary)}</div>`
                      : ""
                  }
                </td>
                ${
                  showPersonalNumberColumn
                    ? `<td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">${escapeHtml(record.personalNumber || "—")}</td>`
                    : ""
                }
                <td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
                  ${escapeHtml(positionNum || "—")}
                </td>
                <td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;">
                  ${escapeHtml(getEmployeeChangeDetailLabel(record))}
                </td>
                <td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                  ${renderEmployeeChangeBubbles(record)}
                </td>
                <td style="box-sizing:border-box;padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
                  ${escapeHtml(fmtDate(record.effectiveDate))}
                </td>
              </tr>
            `
          })
          .join("")}
      </tbody>
    </table>
    </div>
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

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const tablesHtml = renderEmployeeChangeTable(records, {
    showPersonalNumberColumn: audience === "ONBOARDING_GROUP",
  })

  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
        @media (max-width: 640px) {
          .eml-change-table {
            table-layout: auto !important;
            width: auto !important;
            min-width: 100% !important;
          }
          .eml-change-table th, .eml-change-table td {
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
          }
        }
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table border="0" cellpadding="0" cellspacing="0" width="860"
              bgcolor="#ffffff" style="max-width:860px;background-color:#ffffff;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;border-collapse:separate;">

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:24px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                    Personální změny
                  </div>
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:23px;font-weight:700;line-height:1.25;white-space:nowrap;">
                    ${escapeHtml(buildEmployeeChangeReportSubject({ month, audience }))}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:28px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};color:#111827;">
                  <p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">
                    Vážené kolegyně, vážení kolegové,
                  </p>

                  <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;">
                    ${buildReportIntroSentenceHtml({
                      hasOnboarding: false,
                      hasOffboarding: false,
                      hasChanges: true,
                      kind: "actual",
                      months: [month],
                    })}
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
                <td bgcolor="${primary}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#e5f5f2;border-radius:0 0 12px 12px;">
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

function renderNastupyOdchodySection(args: {
  title: string
  note: string
  rows: EmailRecord[]
  dateHeader: string
  kind: "planned" | "actual"
  spacingTop: boolean
  showMonthly: boolean
}): string {
  if (!args.rows.length) return ""

  const renderTable =
    args.kind === "planned"
      ? renderNastupyOdchodyTablePlanned
      : renderNastupyOdchodyTableActual

  const note = `<p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">${escapeHtml(args.note)}</p>`

  if (!args.showMonthly) {
    return `
      <h2 style="font-size: 16px; color: #111827; margin: ${
        args.spacingTop ? "18px" : "0"
      } 0 4px 0; font-weight: 700;">${escapeHtml(args.title)}</h2>
      ${note}
      ${renderTable(args.rows, args.dateHeader)}
    `
  }

  const groups = groupByMonthKey(args.rows, (row) => row.date)

  return groups
    .map(([monthKey, monthRows], index) => {
      const monthLabel =
        monthKey === "neuvedeno" ? "" : ` – ${formatSingleMonthLabel(monthKey)}`

      return `
        <h2 style="font-size: 16px; color: #111827; margin: ${
          args.spacingTop || index > 0 ? "18px" : "0"
        } 0 4px 0; font-weight: 700;">${escapeHtml(args.title)}${escapeHtml(monthLabel)}</h2>
        ${note}
        ${renderTable(monthRows, args.dateHeader)}
      `
    })
    .join("")
}

export async function renderCombinedReportHtml(args: {
  months: string[]
  onboardingsPlanned: EmailRecord[]
  onboardingsActual: EmailRecord[]
  offboardingsPlanned: EmailRecord[]
  offboardingsActual: EmailRecord[]
  changes: EmployeeChangeEmailRecord[]
  changeAudience: EmployeeChangeReportAudience
}): Promise<{ html: string; text: string; subject: string }> {
  const {
    months,
    onboardingsPlanned,
    onboardingsActual,
    offboardingsPlanned,
    offboardingsActual,
    changes,
    changeAudience,
  } = args

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const recordDates: Array<string | Date | null | undefined> = [
    ...onboardingsPlanned.map((r) => r.date),
    ...onboardingsActual.map((r) => r.date),
    ...offboardingsPlanned.map((r) => r.date),
    ...offboardingsActual.map((r) => r.date),
    ...changes.map((r) => r.effectiveDate),
  ]
  const actualMonthsSet = new Set(
    recordDates
      .filter((d): d is string | Date => d != null)
      .map((d) => format(new Date(d), "yyyy-MM"))
  )
  const actualMonths =
    actualMonthsSet.size > 0 ? Array.from(actualMonthsSet).sort() : months

  const onboardingPresence = presenceOf(
    onboardingsPlanned.length > 0,
    onboardingsActual.length > 0
  )
  const offboardingPresence = presenceOf(
    offboardingsPlanned.length > 0,
    offboardingsActual.length > 0
  )
  const hasChanges = changes.length > 0
  const hasAnyContent =
    onboardingPresence !== "none" ||
    offboardingPresence !== "none" ||
    hasChanges

  const presences = [onboardingPresence, offboardingPresence].filter(
    (p) => p !== "none"
  )
  const overallKind =
    presences.length > 0 && presences.every((p) => p === "planned")
      ? "planned"
      : presences.length > 0 && presences.every((p) => p === "actual")
        ? "actual"
        : "mixed"

  const subjectTopic =
    overallKind === "planned"
      ? `Přehled personálních změn – ${plannedScopeLabelWithChanges(
          onboardingPresence !== "none",
          offboardingPresence !== "none",
          hasChanges
        )}`
      : "Přehled personálních změn"

  const monthPhrase = formatMonthList(actualMonths)
  const subject = `${subjectTopic} – ${monthPhrase.replace(/^v měsíc(i|ích) /, "")}`

  const introSentence = buildCombinedIntroSentenceHtml({
    hasOnboarding: onboardingPresence !== "none",
    hasOffboarding: offboardingPresence !== "none",
    hasChanges,
    months: actualMonths,
    overallKind,
  })

  const showMonthly = actualMonths.length > 1

  const onboardingTitlePlanned =
    onboardingPresence === "mixed" ? "Nástupy – předpokládané" : "Nástupy"
  const onboardingTitleActual =
    onboardingPresence === "mixed" ? "Nástupy – uskutečněné" : "Nástupy"
  const offboardingTitlePlanned =
    offboardingPresence === "mixed" ? "Odchody – předpokládané" : "Odchody"
  const offboardingTitleActual =
    offboardingPresence === "mixed" ? "Odchody – uskutečněné" : "Odchody"

  const sections: string[] = []

  sections.push(
    renderNastupyOdchodySection({
      title: onboardingTitlePlanned,
      note: "Seznam zaměstnanců s předpokládaným nástupem ve vybraném období.",
      rows: onboardingsPlanned,
      dateHeader: "Datum nástupu",
      kind: "planned",
      spacingTop: sections.length > 0,
      showMonthly,
    })
  )

  sections.push(
    renderNastupyOdchodySection({
      title: onboardingTitleActual,
      note: "Seznam zaměstnanců s nástupem ve vybraném období.",
      rows: onboardingsActual,
      dateHeader: "Datum nástupu",
      kind: "actual",
      spacingTop: sections.filter(Boolean).length > 0,
      showMonthly,
    })
  )

  sections.push(
    renderNastupyOdchodySection({
      title: offboardingTitlePlanned,
      note: "Seznam zaměstnanců s předpokládaným odchodem ve vybraném období.",
      rows: offboardingsPlanned,
      dateHeader: "Datum odchodu",
      kind: "planned",
      spacingTop: sections.filter(Boolean).length > 0,
      showMonthly,
    })
  )

  sections.push(
    renderNastupyOdchodySection({
      title: offboardingTitleActual,
      note: "Seznam zaměstnanců s ukončením pracovního poměru ve vybraném období.",
      rows: offboardingsActual,
      dateHeader: "Datum odchodu",
      kind: "actual",
      spacingTop: sections.filter(Boolean).length > 0,
      showMonthly,
    })
  )

  if (hasChanges) {
    const changeSpacingTop = sections.filter(Boolean).length > 0
    const changesNote = `<p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0; line-height: 1.4; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">Seznam zaměstnaneckých změn ve vybraném období.</p>`

    if (!showMonthly) {
      sections.push(`
        <h2 style="font-size: 16px; color: #111827; margin: ${
          changeSpacingTop ? "18px" : "0"
        } 0 4px 0; font-weight: 700;">Personální změny</h2>
        ${changesNote}
        ${renderEmployeeChangeTable(changes, {
          showPersonalNumberColumn: changeAudience !== "ALL_EMPLOYEES",
        })}
      `)
    } else {
      const changeGroups = groupByMonthKey(changes, (row) => row.effectiveDate)

      sections.push(
        changeGroups
          .map(([monthKey, monthRows], index) => {
            const monthLabel =
              monthKey === "neuvedeno"
                ? ""
                : ` – ${formatSingleMonthLabel(monthKey)}`

            return `
              <h2 style="font-size: 16px; color: #111827; margin: ${
                changeSpacingTop || index > 0 ? "18px" : "0"
              } 0 4px 0; font-weight: 700;">Personální změny${escapeHtml(monthLabel)}</h2>
              ${changesNote}
              ${renderEmployeeChangeTable(monthRows, {
                showPersonalNumberColumn: changeAudience !== "ALL_EMPLOYEES",
              })}
            `
          })
          .join("")
      )
    }
  }

  const sectionsHtml = sections.filter(Boolean).join("")

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
        @media (prefers-color-scheme: dark) {
          .eml-intro-pad, .eml-intro-pad p { color: #ffffff !important; }
        }
        [data-ogsc] .eml-intro-pad, [data-ogsc] .eml-intro-pad p {
          color: #ffffff !important;
        }
        @media (max-width: 640px) {
          .eml-change-table {
            table-layout: auto !important;
            width: auto !important;
            min-width: 100% !important;
          }
          .eml-change-table th, .eml-change-table td {
            white-space: normal !important;
            word-break: normal !important;
            overflow-wrap: normal !important;
          }
        }
      </style>
    </head>
    <body class="eml-print-page" style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important; font-family: ${EMAIL_FONT_FAMILY}; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">
      <table class="eml-print-page" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table
              class="eml-print-card"
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="100%"
              bgcolor="#ffffff"
              style="
                max-width: 860px;
                background-color: #ffffff;
                border-collapse: separate;
                border: 1px solid #d9ece7;
                border-radius: 12px;
                overflow: hidden;
              "
            >
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:24px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">
                    Personální změny
                  </div>
                  <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:23px;font-weight:700;line-height:1.25;">
                    ${escapeHtml(subject)}
                  </div>
                </td>
              </tr>

              <tr>
                <td class="eml-intro-pad" style="padding: 15px 30px; background-color: transparent; border-bottom: 1px solid #d9ece7; font-family: ${EMAIL_FONT_FAMILY}; font-size: 14px; line-height: 1.6; color: #082B2A;">
                  <p style="margin:0 0 8px 0; font-size: 14px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">Vážené kolegyně, vážení kolegové,</p>
                  <p style="margin:0; font-size: 14px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">${introSentence}</p>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding: 26px 22px; background-color: #ffffff; font-family: ${EMAIL_FONT_FAMILY};">
                  ${
                    hasAnyContent
                      ? sectionsHtml
                      : `
                    <div style="padding: 40px; text-align: center; border: 2px dashed #d9ece7; color: #6b7280; font-style: italic;">
                      Pro vybrané období nejsou evidovány žádné personální změny.
                    </div>
                    `
                  }
                </td>
              </tr>

              <tr>
                <td
                  bgcolor="${primary}"
                  style="
                    padding: 18px 26px;
                    font-family: ${EMAIL_FONT_FAMILY};
                    font-size: 12px;
                    color: #e5f5f2;
                    line-height: 1.5;
                    border-top: 1px solid ${primary};
                    border-radius: 0 0 12px 12px;
                  "
                >
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

  const textIntro = buildCombinedIntroSentence({
    hasOnboarding: onboardingPresence !== "none",
    hasOffboarding: offboardingPresence !== "none",
    hasChanges,
    months: actualMonths,
    overallKind,
  })

  const text = [
    "Vážené kolegyně, vážení kolegové,",
    "",
    textIntro,
    "",
    onboardingsPlanned.length
      ? `Nástupy – plánované: ${onboardingsPlanned.length}`
      : "",
    onboardingsActual.length
      ? `Nástupy – skutečné: ${onboardingsActual.length}`
      : "",
    offboardingsPlanned.length
      ? `Odchody – plánované: ${offboardingsPlanned.length}`
      : "",
    offboardingsActual.length
      ? `Odchody – skutečné: ${offboardingsActual.length}`
      : "",
    hasChanges ? `Personální změny: ${changes.length}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  return { html, text, subject }
}

type SendSignatureInviteEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  signUrl: string
  roleNote?: string | null
  pendingItems?: string[] | null
  headerSubtitle?: string | null
  substituteInfo?: {
    name: string
    email?: string | null
    position?: string | null
    department?: string | null
  } | null
  alsoActingOnBehalfOf?: {
    name: string
    email?: string | null
    position?: string | null
    department?: string | null
    obligations: string[]
  } | null
}

export async function sendSignatureInviteEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  roleNote,
  pendingItems,
  headerSubtitle,
  substituteInfo,
  alsoActingOnBehalfOf,
}: SendSignatureInviteEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const titleArgs = {
    roleLabel: headerSubtitle ? "Vedoucí odboru" : null,
    hasSubstituteInfo: Boolean(substituteInfo),
    hasAlsoActingOnBehalfOf: Boolean(alsoActingOnBehalfOf),
  }
  const headerTitle = buildExitChecklistInviteTitle(titleArgs)
  const subject = buildExitChecklistInviteSubject({
    employeeName,
    ...titleArgs,
  })

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
        .intro-text {
          font-family: ${EMAIL_FONT_FAMILY};
          font-size:14px;
          line-height: 1.6;
          color: #082B2A;
        }
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr bgcolor="${primary}">
                <td
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
                          ${escapeHtml(headerTitle)}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td
                  bgcolor="#ffffff"
                  style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};"
                >
                  <p class="intro-text" style="margin:0 0 16px 0;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    ${
                      headerSubtitle
                        ? "Personální oddělení vám jako vedoucímu odboru zaslalo pozvánku k elektronickému podpisu výstupního listu daného zaměstnance:"
                        : "Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu uvedeného zaměstnance:"
                    }
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
                    pendingItems && pendingItems.length > 0
                      ? renderAgendaItemsBoxHtml(
                          "Vaše agenda – zbývá Vám podepsat:",
                          pendingItems,
                          bgLight
                        )
                      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                        ? renderAgendaItemsBoxHtml(
                            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS,
                            bgLight
                          )
                        : roleNote
                          ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
                    <tr>
                      <td style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.5;color:#92400e;">
                        ${renderMultilineHtml(roleNote)}
                      </td>
                    </tr>
                  </table>
                  `
                          : ""
                  }

                  ${
                    alsoActingOnBehalfOf
                      ? `
                  <p class="intro-text" style="margin:0 0 10px 0;color:#374151;">
                    Byli jste zároveň pozváni k podpisu výstupního listu v zástupu za:
                  </p>
                  ${renderBehalfPersonTableHtml({
                    nameLabel: "Zastupujete za",
                    name: alsoActingOnBehalfOf.name,
                    position: alsoActingOnBehalfOf.position,
                    department: alsoActingOnBehalfOf.department,
                  })}
                  ${
                    alsoActingOnBehalfOf.obligations.length > 0
                      ? renderInfoBubbleHtml({
                          bgLight,
                          title:
                            "Agenda, kterou máte v zastoupení ověřit a podepsat",
                          bodyHtml: `
                    <div style="font-size:13px;color:#374151;line-height:1.6;">
                      ${alsoActingOnBehalfOf.obligations.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                    </div>
                    `,
                        })
                      : ""
                  }
                  ${renderBehalfNoteHtml()}
                  `
                      : ""
                  }

                  ${
                    substituteInfo
                      ? `
                  <p class="intro-text" style="margin:0 0 10px 0;color:#374151;">
                    Personální oddělení zároveň pro podpis tohoto výstupního listu a vaší agendy vybralo jako zástupce níže uvedenou pověřenou osobu:
                  </p>
                  ${renderBehalfPersonTableHtml({
                    name: substituteInfo.name,
                    position: substituteInfo.position,
                    department: substituteInfo.department,
                  })}
                  ${
                    pendingItems && pendingItems.length > 0
                      ? renderInfoBubbleHtml({
                          bgLight,
                          title: "Agenda, kterou má zástupce ověřit a podepsat",
                          bodyHtml: `
                    <div style="font-size:13px;color:#374151;line-height:1.6;">
                      ${pendingItems.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                    </div>
                    `,
                        })
                      : ""
                  }
                  ${renderInfoBubbleHtml({
                    bgLight: "#fef3c7",
                    borderColor: "#fde68a",
                    titleColor: "#92400e",
                    title: "Poznámka",
                    bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.
                    </p>
                    `,
                  })}
                  `
                      : ""
                  }

                  ${renderLoginInfoBubbleHtml({ signUrl })}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    ...(headerSubtitle ? ["VÝSTUPNÍ LIST", headerSubtitle, ""] : []),
    greeting,
    "",
    headerSubtitle
      ? "Personální oddělení vám jako vedoucímu odboru zaslalo pozvánku k elektronickému podpisu výstupního listu daného zaměstnance."
      : "Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu uvedeného zaměstnance.",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    ...(pendingItems && pendingItems.length > 0
      ? agendaItemsTextLines("Vaše agenda – zbývá Vám podepsat:", pendingItems)
      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
        ? agendaItemsTextLines(
            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS
          )
        : roleNote
          ? [roleNote, ""]
          : []),
    ...(alsoActingOnBehalfOf
      ? [
          "Byli jste zároveň pozváni k podpisu výstupního listu v zástupu za:",
          `Zastupujete za: ${alsoActingOnBehalfOf.name}`,
          `Funkce: ${alsoActingOnBehalfOf.position || "—"}`,
          `Odbor/oddělení: ${alsoActingOnBehalfOf.department || "—"}`,
          ...(alsoActingOnBehalfOf.obligations.length > 0
            ? [
                "Agenda, kterou máte v zastoupení ověřit a podepsat:",
                ...alsoActingOnBehalfOf.obligations.map((item) => `- ${item}`),
              ]
            : []),
          "",
          "Poznámka:",
          `Podpis pro tento zástup prosím proveďte výhradně přes tlačítko „Podepsat v zastoupení" v aplikaci, nejedná se o podpis vlastní agendy.`,
          "",
        ]
      : []),
    ...(substituteInfo
      ? [
          "Personální oddělení zároveň pro podpis tohoto výstupního listu a vaší agendy vybralo jako zástupce níže uvedenou pověřenou osobu:",
          `Zástupce: ${substituteInfo.name}`,
          `Funkce: ${substituteInfo.position || "—"}`,
          `Odbor/oddělení: ${substituteInfo.department || "—"}`,
          "",
          ...(pendingItems && pendingItems.length > 0
            ? [
                "Agenda, kterou má zástupce ověřit a podepsat:",
                ...pendingItems.map((item) => `- ${item}`),
                "",
              ]
            : []),
          "Poznámka:",
          "Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.",
          "",
        ]
      : []),
    "Přihlaste se svým firemním účtem Google (@praha6.cz).",
    "Po přihlášení budete přesměrováni na konkrétní výstupní list k podpisu.",
    "",
    `Odkaz: ${signUrl}`,
    "",
    ...renderHrContactsText(),
  ].join("\n")

  await sendMail({
    to: [to],
    subject,
    html,
    text,
  })
}

type SendExitChecklistSignatureReminderEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  daysBeforeEnd: number
  signUrl: string
  roleNote?: string | null
  pendingItems?: string[] | null
  behalfName?: string | null
  behalfPosition?: string | null
  behalfDepartment?: string | null
  isEmployee?: boolean
  isManager?: boolean
}

export async function sendExitChecklistSignatureReminderEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  daysBeforeEnd,
  signUrl,
  roleNote,
  pendingItems,
  behalfName,
  behalfPosition,
  behalfDepartment,
  isEmployee,
  isManager,
}: SendExitChecklistSignatureReminderEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const daysLabel =
    daysBeforeEnd <= 0 ? "dnes" : `za ${formatDayCountCs(daysBeforeEnd)}`
  const titleArgs = {
    daysBeforeEnd,
    isEmployee,
    isManager,
    isBehalf: Boolean(behalfName),
  }
  const headerTitle = buildExitChecklistReminderTitle(titleArgs)
  const subject = buildExitChecklistReminderSubject({
    employeeName,
    ...titleArgs,
  })

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
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
            <table
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:0.9;">
                    Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    ${escapeHtml(headerTitle)}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                    ${
                      isEmployee
                        ? `stále čekáme na váš podpis vlastního výstupního listu. Pracovní poměr vám končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`
                        : isManager && !behalfName
                          ? `stále čekáme na váš podpis jako vedoucího odboru u výstupního listu níže uvedeného zaměstnance. Jeho pracovní poměr končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`
                          : `stále čekáme na váš podpis výstupního listu níže uvedeného zaměstnance. Jeho pracovní poměr končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`
                    }
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
                    isEmployee
                      ? `
                  <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Zároveň zkontrolujte, zda ve výstupním listu nechybí i
                    podpisy dalších osob (např. vedoucího odboru), a ověřte
                    fyzické vrácení veškerého svěřeného majetku a řádné
                    předání své agendy.
                  </p>
                  `
                      : ""
                  }

                  ${
                    behalfName
                      ? `
                  <p style="margin:0 0 10px 0;font-size:14px;color:#374151;line-height:1.6;">
                    ${
                      isManager
                        ? "Podepisujete v zastoupení za vedoucího odboru:"
                        : "Podepisujete v zastoupení za:"
                    }
                  </p>
                  ${renderBehalfPersonTableHtml({
                    nameLabel: "Zastupujete za",
                    name: behalfName,
                    position: behalfPosition,
                    department: behalfDepartment,
                  })}
                  `
                      : ""
                  }

                  ${
                    pendingItems && pendingItems.length > 0
                      ? renderAgendaItemsBoxHtml(
                          "Vaše agenda – zbývá Vám podepsat:",
                          pendingItems,
                          bgLight
                        )
                      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                        ? renderAgendaItemsBoxHtml(
                            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS,
                            bgLight
                          )
                        : roleNote
                          ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
                    <tr>
                      <td style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.5;color:#92400e;">
                        ${renderMultilineHtml(roleNote)}
                      </td>
                    </tr>
                  </table>
                  `
                          : `
                  <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Ještě zbývá podepsat tento výstupní list – zkontrolujte,
                    že má zaměstnanec vše fyzicky vyřízeno a odevzdáno, a
                    podepište.
                  </p>
                  `
                  }

                  ${behalfName ? renderBehalfNoteHtml() : ""}

                  ${renderLoginInfoBubbleHtml({ signUrl })}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "VÝSTUPNÍ LIST",
    headerTitle,
    "",
    greeting,
    "",
    isEmployee
      ? `Stále čekáme na váš podpis vlastního výstupního listu. Pracovní poměr vám končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`
      : isManager && !behalfName
        ? `Stále čekáme na váš podpis jako vedoucího odboru u výstupního listu níže uvedeného zaměstnance. Jeho pracovní poměr končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`
        : `Stále čekáme na váš podpis výstupního listu níže uvedeného zaměstnance. Jeho pracovní poměr končí ${daysLabel === "dnes" ? "dnes" : daysLabel}:`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    ...(isEmployee
      ? [
          "Zároveň zkontrolujte, zda ve výstupním listu nechybí i podpisy dalších osob (např. vedoucího odboru), a ověřte fyzické vrácení veškerého svěřeného majetku a řádné předání své agendy.",
          "",
        ]
      : []),
    ...(behalfName
      ? [
          isManager
            ? "Podepisujete v zastoupení za vedoucího odboru:"
            : "Podepisujete v zastoupení za:",
          `Zastupujete za: ${behalfName}`,
          `Funkce: ${behalfPosition || "—"}`,
          `Odbor/oddělení: ${behalfDepartment || "—"}`,
          "",
        ]
      : []),
    ...(pendingItems && pendingItems.length > 0
      ? agendaItemsTextLines("Vaše agenda – zbývá Vám podepsat:", pendingItems)
      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
        ? agendaItemsTextLines(
            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS
          )
        : [
            roleNote ??
              `Ještě zbývá podepsat tento výstupní list – zkontrolujte, že má zaměstnanec vše fyzicky vyřízeno a odevzdáno, a podepište.`,
          ]),
    ...(behalfName
      ? [
          "Poznámka:",
          `Podpis pro tento zástup prosím proveďte výhradně přes tlačítko „Podepsat v zastoupení" v aplikaci, nejedná se o podpis vlastní agendy.`,
          "",
        ]
      : []),
    "",
    `Odkaz: ${signUrl}`,
    "",
    ...renderHrContactsText(),
  ].join("\n")

  await sendMail({
    to: [to],
    subject,
    html,
    text,
  })
}

type SendSignatureSubstituteNoticeEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  signUrl: string
  substituteName: string
  substitutePosition?: string | null
  substituteDepartment?: string | null
  roleNote?: string | null
  pendingItems?: string[] | null
  removed?: boolean
}

export async function sendSignatureSubstituteNoticeEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  substituteName,
  substitutePosition,
  substituteDepartment,
  roleNote,
  pendingItems,
  removed = false,
}: SendSignatureSubstituteNoticeEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const substituteNoticeTitleArgs = {
    roleLabel:
      roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE ? "Vedoucí odboru" : null,
    hasSubstituteInfo: true,
  }
  const headerTitle = removed
    ? "Oznámení o zrušení zástupu"
    : buildExitChecklistInviteTitle(substituteNoticeTitleArgs)
  const subject = removed
    ? `Zastoupení při podpisu výstupního listu zrušeno – ${employeeName}`
    : buildExitChecklistInviteSubject({
        employeeName,
        ...substituteNoticeTitleArgs,
      })

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
        .intro-text {
          font-family: ${EMAIL_FONT_FAMILY};
          font-size:14px;
          line-height: 1.6;
          color: #082B2A;
        }
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr bgcolor="${primary}">
                <td
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
                          ${escapeHtml(headerTitle)}
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td
                  bgcolor="#ffffff"
                  style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};"
                >
                  <p class="intro-text" style="margin:0 0 16px 0;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    ${
                      removed
                        ? `pro níže uvedený odchod zaměstnance byl odebrán přidělený zástupce. Nyní jste Personálním oddělením evidován jako jediná pověřená osoba k podpisu daného výstupního listu${roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE ? " jako vedoucí odboru" : ""}:`
                        : `jste evidováni jako pověřená osoba k podpisu výstupního listu:`
                    }
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
                    pendingItems && pendingItems.length > 0
                      ? ""
                      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                        ? renderAgendaItemsBoxHtml(
                            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS,
                            bgLight
                          )
                        : roleNote
                          ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
                    <tr>
                      <td style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.5;color:#92400e;">
                        ${renderMultilineHtml(roleNote)}
                      </td>
                    </tr>
                  </table>
                  `
                          : ""
                  }

                  <p class="intro-text" style="margin:0 0 10px 0;color:#374151;">
                    ${
                      removed
                        ? `Níže je uvedená zastupující osoba, které byl od této chvíle zrušen zástup:`
                        : `Personální oddělení zároveň pro podpis tohoto výstupního listu a vaší agendy vybralo jako zástupce níže uvedenou pověřenou osobu:`
                    }
                  </p>

                  ${renderBehalfPersonTableHtml({
                    name: substituteName,
                    position: substitutePosition,
                    department: substituteDepartment,
                  })}

                  ${
                    removed
                      ? renderInfoBubbleHtml({
                          bgLight: "#fef3c7",
                          borderColor: "#fde68a",
                          titleColor: "#92400e",
                          title: "Poznámka",
                          bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      Zastupující za Vás již nemůže od této chvíle nic
                      podepsat. Níže uvedenou agendu nyní podepisujete pouze
                      Vy sami.
                    </p>
                    `,
                        }) +
                        (pendingItems && pendingItems.length > 0
                          ? renderInfoBubbleHtml({
                              bgLight,
                              title: "Vaše agenda – zbývá Vám podepsat",
                              bodyHtml: `
                    <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#374151;">
                      ${pendingItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                    </ul>
                    `,
                            })
                          : "")
                      : renderInfoBubbleHtml({
                          bgLight: "#fef3c7",
                          borderColor: "#fde68a",
                          titleColor: "#92400e",
                          title: "Poznámka",
                          bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.
                    </p>
                    `,
                        })
                  }

                  ${renderLoginInfoBubbleHtml({ signUrl })}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    removed
      ? `Pro níže uvedený odchod zaměstnance byl odebrán přidělený zástupce. Nyní jste Personálním oddělením evidován jako jediná pověřená osoba k podpisu daného výstupního listu${roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE ? " jako vedoucí odboru" : ""}.`
      : "Jste evidováni jako pověřená osoba k podpisu výstupního listu.",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    ...(pendingItems && pendingItems.length > 0
      ? []
      : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
        ? agendaItemsTextLines(
            "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
            EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS
          )
        : roleNote
          ? [roleNote, ""]
          : []),
    removed
      ? "Níže je uvedená zastupující osoba, které byl od této chvíle zrušen zástup:"
      : "Personální oddělení zároveň pro podpis tohoto výstupního listu a vaší agendy vybralo jako zástupce níže uvedenou pověřenou osobu:",
    `Zástupce: ${substituteName}`,
    `Funkce: ${substitutePosition || "—"}`,
    `Odbor/oddělení: ${substituteDepartment || "—"}`,
    "",
    ...(removed
      ? [
          "Poznámka:",
          "Zastupující za Vás již nemůže od této chvíle nic podepsat. Níže uvedenou agendu nyní podepisujete pouze Vy sami.",
          "",
          ...(pendingItems && pendingItems.length > 0
            ? [
                "Vaše agenda – zbývá Vám podepsat:",
                ...pendingItems.map((item) => `- ${item}`),
                "",
              ]
            : []),
        ]
      : [
          "Poznámka:",
          "Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.",
          "",
        ]),
    "Přihlaste se svým firemním účtem Google (@praha6.cz).",
    "Po přihlášení budete přesměrováni na konkrétní výstupní list k podpisu.",
    "",
    `Odkaz: ${signUrl}`,
    "",
    ...renderHrContactsText(),
  ].join("\n")

  await sendMail({
    to: [to],
    subject,
    html,
    text,
  })
}

type SendEmployeeExitChecklistInviteEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  signUrl: string
}

function renderStepCardHtml(args: {
  number: number
  accent: string
  bg: string
  border: string
  title: string
  bodyHtml: string
}): string {
  return `
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
    <tr>
      <td style="border:1px solid ${args.border};border-radius:10px;overflow:hidden;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="background-color:${args.bg};padding:12px 16px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:28px;height:28px;border-radius:50%;background-color:${args.accent};text-align:center;vertical-align:middle;">
                    <div style="font-family:${EMAIL_FONT_FAMILY};color:#ffffff;font-size:14px;font-weight:bold;line-height:28px;">${args.number}</div>
                  </td>
                  <td style="padding-left:10px;">
                    <div style="font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;color:#111827;">
                      ${args.title}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:14px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.6;color:#374151;">
              ${args.bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `
}

export async function sendEmployeeExitChecklistInviteEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
}: SendEmployeeExitChecklistInviteEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const subject = `Váš odchod byl zaevidován – výstupní list k podpisu`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(subject)}</title>
      <style type="text/css">
        body { margin: 0; padding: 0; }
        table { border-collapse: collapse; }
        ${EMAIL_GLOBAL_FONT_STYLE}
        .intro-text {
          font-family: ${EMAIL_FONT_FAMILY};
          font-size:14px;
          line-height: 1.6;
          color: #082B2A;
        }
      </style>
    </head>

    <body style="margin:0;padding:0;background-color:${bgLight};width:100% !important;font-family:${EMAIL_FONT_FAMILY};">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding:30px 10px;">
            <table
              border="0"
              cellpadding="0"
              cellspacing="0"
              width="600"
              bgcolor="#ffffff" style="max-width:600px;background-color:#ffffff;border-collapse:separate;border:1px solid #d9ece7;border-radius:12px;overflow:hidden;"
            >
              <tr bgcolor="${primary}">
                <td
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
                          Váš odchod byl zaevidován
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td
                  bgcolor="#ffffff"
                  style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};"
                >
                  <p class="intro-text" style="margin:0 0 16px 0;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    Váš odchod z pracovního poměru byl zaevidován jako
                    plánovaný. Níže uvádíme detaily a postup pro řádné
                    předání agendy, vrácení majetku a podpis výstupního
                    listu.
                  </p>

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    Aby byl Váš odchod řádně ukončen, je potřeba předat
                    agendu, vrátit svěřený majetek, vyrovnat případné
                    závazky a elektronicky podepsat výstupní list.
                  </p>

                  ${renderExitChecklistInfoTable({
                    primary,
                    bgLight,
                    employeeName,
                    employeePosition,
                    employeeDepartment,
                    employmentEndDate,
                  })}

                  ${renderStepCardHtml({
                    number: 1,
                    accent: primary,
                    bg: bgLight,
                    border: "#bfe3dc",
                    title: "Fyzické vrácení majetku a vyrovnání závazků",
                    bodyHtml: `
                      <p style="margin:0 0 10px 0;">
                        Než podepíšete elektronický výstupní list, musíte
                        osobně či po dohodě kontaktovat příslušné odpovědné
                        osoby, odevzdat majetek a vyrovnat závazky. Přehled
                        odpovědných osob a kanceláří najdete i přímo
                        v aplikaci Výstupní list:
                      </p>
                      <p style="margin:0;line-height:1.7;">
                        <strong>Vedoucí Vašeho odboru</strong> – předání
                        agendy a písemný předávací protokol.<br/>
                        <strong>Správa objektu – SNEO, a.s.</strong>
                        (přízemí, č. dv. 008) – vrácení identifikační karty
                        (čipu) a dálkových ovladačů.<br/>
                        <strong>Odbor služeb</strong> (č. dv. 001 / 006) –
                        vrácení služebních pomůcek, vyúčtování záloh, čipy
                        od vozidla či elektronická jízdenka.<br/>
                        <strong>Personální oddělení</strong> (č. dv. 521) –
                        vrácení služebního průkazu.<br/>
                        <strong>KITT6</strong> (Dr. Zikmunda Wintra 20) –
                        odevzdání výpočetní techniky, mobilního telefonu,
                        vyúčtování limitu a kontrola předání dokumentů
                        v e-spisu.<br/>
                        <strong>Další oddělení a odbory</strong> (spisová
                        služba, krizové řízení a bezpečnost, mzdová
                        účtárna, ekonomický odbor, právní odbor) – dle
                        Vašich konkrétních závazků.
                      </p>
                    `,
                  })}

                  ${renderStepCardHtml({
                    number: 2,
                    accent: "#d97706",
                    bg: "#fef3c7",
                    border: "#fcd34d",
                    title: "Elektronické potvrzení a podpis výstupního listu",
                    bodyHtml: `
                      <p style="margin:0 0 10px 0;">
                        Přihlaste se svým firemním účtem Google
                        (<strong>@praha6.cz</strong>) – stejným, na který
                        vám tento e-mail přišel. Po přihlášení potvrďte
                        předání agendy/majetku a připojte svůj elektronický
                        podpis.
                      </p>
                      <p style="margin:0 0 14px 0;">
                        Potvrzení o vyrovnání závazků budou do systému
                        postupně vkládat a podepisovat i zástupci
                        jednotlivých odborů/oddělení.
                      </p>
                      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
                        <tr>
                          <td bgcolor="#d97706" style="border-radius:6px;background-color:#d97706;">
                            <a
                              href="${escapeHtml(signUrl)}"
                              style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                            >
                              Otevřít výstupní list
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:10px 0 2px 0;font-size:12px;">
                        Pokud tlačítko nefunguje, zkopírujte tento odkaz do
                        prohlížeče:
                      </p>
                      <p style="margin:0;word-break:break-all;">
                        <a href="${escapeHtml(signUrl)}" style="font-family:monospace;font-size:12px;color:#92400e;">
                          ${escapeHtml(signUrl)}
                        </a>
                      </p>
                    `,
                  })}

                  ${renderStepCardHtml({
                    number: 3,
                    accent: "#059669",
                    bg: "#d1fae5",
                    border: "#a7f3d0",
                    title: "Dokončení a vyzvednutí zápočtového listu",
                    bodyHtml: `
                      <p style="margin:0;">
                        Jakmile podepíší elektronický výstupní list všechny
                        zúčastněné strany, obdržíte e-mailem finální
                        potvrzení. Následně se dostavte na Personální
                        oddělení (č. dv. 521) k převzetí zápočtového listu.
                      </p>
                    `,
                  })}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    "Váš odchod z pracovního poměru byl zaevidován jako plánovaný. Níže uvádíme detaily a postup pro řádné předání agendy, vrácení majetku a podpis výstupního listu.",
    "",
    "Aby byl Váš odchod řádně ukončen, je potřeba předat agendu, vrátit svěřený majetek, vyrovnat případné závazky a elektronicky podepsat výstupní list.",
    "",
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    "1. Krok: Fyzické vrácení majetku a vyrovnání závazků",
    "Než podepíšete elektronický výstupní list, musíte osobně či po dohodě kontaktovat příslušné odpovědné osoby, odevzdat majetek a vyrovnat závazky:",
    "- Vedoucí Vašeho odboru – předání agendy a písemný předávací protokol.",
    "- Správa objektu – SNEO, a.s. (přízemí, č. dv. 008) – vrácení identifikační karty (čipu) a dálkových ovladačů.",
    "- Odbor služeb (č. dv. 001 / 006) – vrácení služebních pomůcek, vyúčtování záloh, čipy od vozidla či elektronická jízdenka.",
    "- Personální oddělení (č. dv. 521) – vrácení služebního průkazu.",
    "- KITT6 (Dr. Zikmunda Wintra 20) – odevzdání výpočetní techniky, mobilního telefonu, vyúčtování limitu a kontrola předání dokumentů v e-spisu.",
    "- Další oddělení a odbory (spisová služba, krizové řízení a bezpečnost, mzdová účtárna, ekonomický odbor, právní odbor) – dle Vašich konkrétních závazků.",
    "",
    "2. Krok: Elektronické potvrzení a podpis výstupního listu",
    "Přihlaste se svým firemním účtem Google (@praha6.cz) – stejným, na který vám tento e-mail přišel. Po přihlášení potvrďte předání agendy/majetku a připojte svůj elektronický podpis.",
    "Potvrzení o vyrovnání závazků budou do systému postupně vkládat a podepisovat i zástupci jednotlivých odborů/oddělení.",
    "",
    `Odkaz: ${signUrl}`,
    "",
    "3. Krok: Dokončení a vyzvednutí zápočtového listu",
    "Jakmile podepíší elektronický výstupní list všechny zúčastněné strany, obdržíte e-mailem finální potvrzení. Následně se dostavte na Personální oddělení (č. dv. 521) k převzetí zápočtového listu.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

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
  employeePersonalNumber?: string | null
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
  employeePersonalNumber?: string | null
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
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  intro?: string | null
  message?: string | null
  sentByName?: string | null
  pdfBuffer: Buffer
  filename: string
}

export type SendProbationEvaluationTajemnikReviewRequestEmailParams = {
  to: string
  tajemnikName?: string | null
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  recommendation?: string | null
  evaluatorName?: string | null
  evaluatorEmail?: string | null
  evaluationLink: string
  pdfBuffer: Buffer
  filename: string
}

export type SendTajemnikReviewCompletedToSupervisorEmailParams = {
  to: string
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  probationEndDate?: string | Date | null
  supervisorName?: string | null
  supervisorEmail?: string | null
  tajemnikName?: string | null
  tajemnikAgreement: "yes" | "no"
  pdfBuffer?: Buffer | null
  pdfFilename?: string | null
}

export type SendProbationEvaluationCompletedEmailParams = {
  to: string[]
  employeeName: string
  employeePersonalNumber?: string | null
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
  employeePersonalNumber?: string | null
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

function renderInfoTable(
  bgLight: string,
  rows: Array<{
    label: string
    value?: string | null
    strong?: boolean
    raw?: boolean
  }>
) {
  const visibleRows = rows.filter(
    (row) => Boolean(row.value) && row.value !== "—"
  )

  return wrapWithBottomSpacing(
    `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${visibleRows
        .map((row, index) => {
          const bg = index % 2 === 0 ? bgLight : "#ffffff"
          const strong = row.strong === true

          return `
            <tr bgcolor="${bg}" style="background-color:${bg};">
              <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:170px;">
                ${escapeHtml(row.label)}
              </td>
              <td style="padding:10px 16px;font-size:14px;line-height:1.4;color:${
                strong ? "#082B2A" : "#374151"
              };font-weight:${strong ? 700 : 400};">
                ${row.raw ? row.value || "—" : escapeHtml(row.value || "—")}
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

function renderEmploymentDocumentInfoTable(args: {
  bgLight: string
  employeeName?: string | null
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
}) {
  return renderInfoTable(args.bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
  ])
}

function renderProbationInfoTable(args: {
  primary: string
  bgLight: string
  employeeName?: string | null
  employeePersonalNumber?: string | null
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
      label: "Osobní číslo",
      value: args.employeePersonalNumber || null,
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
      label: "Hodnotitel",
      value: args.evaluatorName || null,
    },
    {
      label: "E-mail hodnotitele",
      value: args.evaluatorEmail || null,
    },
  ].filter((row) => Boolean(row.value) && row.value !== "—") as Array<{
    label: string
    value?: string | null
    strong?: boolean
    raw?: boolean
  }>

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
                ${row.raw ? row.value || "—" : escapeHtml(row.value || "—")}
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
  employeePersonalNumber,
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
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Zkušební doba${
                      headerLabel
                        ? `<span style="opacity:.6;">&nbsp;·&nbsp;</span>${escapeHtml(headerLabel)}`
                        : ""
                    }
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyhodnocení zkušební doby${
                      employeeName ? ` – ${escapeHtml(employeeName)}` : ""
                    }
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
                    employeePersonalNumber,
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
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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

              ${renderHrContactCardsHtml(primary)}
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
    evaluatorName ? `Hodnotitel: ${evaluatorName}` : "",
    evaluatorEmail ? `E-mail hodnotitele: ${evaluatorEmail}` : "",
    evaluationLink ? `Odkaz: ${evaluationLink}` : "",
    "",
    ...renderHrContactsText(),
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
    employeePersonalNumber: args.employeePersonalNumber,
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
    employeePersonalNumber: args.employeePersonalNumber,
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
  employeePersonalNumber?: string | null
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
      `Připomínka Personálního oddělení: nevyplněné vyhodnocení zkušební doby – ${args.employeeName}`,
    headerLabel: "Připomínka",
    intro:
      args.intro?.trim() ||
      "Formulář k vyhodnocení zkušební doby zatím není finálně vyplněný. Prosíme o kontrolu stavu a případné kontaktování vedoucího.",
    employeeName: args.employeeName,
    employeePersonalNumber: args.employeePersonalNumber,
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
  employeePersonalNumber?: string | null
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
    employeePersonalNumber: args.employeePersonalNumber,
    employeePosition: args.employeePosition,
    employeeDepartment: args.employeeDepartment,
    employeeUnitName: args.employeeUnitName,
    probationEndDate: args.probationEndDate,
    formType: args.formType,
  })
}

type ExitChecklistPendingSigner = {
  name: string
  position?: string | null
  department?: string | null
  behalfLabel?: string | null
  pendingItems?: string[] | null
}

function renderPendingSignersHtml(
  signers: ExitChecklistPendingSigner[]
): string {
  return wrapWithBottomSpacing(
    `
    <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#082B2A;">
      Ještě nepodepsali (${signers.length}):
    </p>
    ${signers
      .map((signer) => {
        const items = (signer.pendingItems ?? []).filter(Boolean)
        const rows = [
          { label: "Jméno", value: signer.name },
          { label: "Funkce", value: signer.position || "—" },
          { label: "Odbor/oddělení", value: signer.department || "—" },
          ...(signer.behalfLabel
            ? [{ label: "Zastupuje za", value: signer.behalfLabel }]
            : []),
        ]

        return wrapWithBottomSpacing(
          `
      <table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
        ${rows
          .map((row, index) => {
            const bg = index % 2 === 0 ? "#E5F5F2" : "#ffffff"
            return `
              <tr bgcolor="${bg}" style="background-color:${bg};">
                <td style="padding:8px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:150px;">
                  ${escapeHtml(row.label)}
                </td>
                <td style="padding:8px 14px;font-size:13px;line-height:1.4;color:#082B2A;font-weight:700;">
                  ${escapeHtml(row.value)}
                </td>
              </tr>
            `
          })
          .join("")}
        ${
          items.length > 0
            ? `
        <tr bgcolor="#ffffff" style="background-color:#ffffff;">
          <td style="padding:8px 14px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:150px;vertical-align:top;">
            Agenda
          </td>
          <td style="padding:8px 14px;font-size:13px;line-height:1.5;color:#374151;">
            <ul style="margin:0;padding-left:16px;">
              ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </td>
        </tr>
        `
            : ""
        }
      </table>
      `,
          10
        )
      })
      .join("")}
    `,
    18
  )
}

function renderPendingSignersText(
  signers: ExitChecklistPendingSigner[]
): string[] {
  if (signers.length === 0) return []

  return [
    "",
    `Ještě nepodepsali (${signers.length}):`,
    ...signers.flatMap((signer) => {
      const items = (signer.pendingItems ?? []).filter(Boolean)
      return [
        `- ${signer.name}`,
        `  Funkce: ${signer.position || "—"}`,
        `  Odbor/oddělení: ${signer.department || "—"}`,
        ...(signer.behalfLabel
          ? [`  Zastupuje za: ${signer.behalfLabel}`]
          : []),
        ...items.map((item) => `  Agenda: ${item}`),
      ]
    }),
  ]
}

export async function sendExitChecklistDueSoonReminderEmail(args: {
  to: string[]
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  employmentEndDate?: string | Date | null
  daysBeforeEnd: number
  checklistLink?: string | null
  subject?: string | null
  bannerTitle?: string | null
  intro?: string | null
  pendingSigners?: ExitChecklistPendingSigner[] | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)
  const pendingSigners = (args.pendingSigners ?? []).filter(
    (signer) => signer && signer.name
  )

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const daysLabel = formatDayCountCs(args.daysBeforeEnd)

  const defaultTitle = `Blíží se konec pracovního poměru – ${args.employeeName}`
  const subject = args.subject?.trim() || defaultTitle
  const bannerTitle = args.bannerTitle?.trim() || subject

  const intro =
    args.intro?.trim() ||
    `pracovní poměr zaměstnance končí za ${daysLabel} a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu všech povinných polí.`

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    {
      label: "Konec pracovního poměru",
      value: fmtDate(args.employmentEndDate),
    },
    { label: "Zbývá", value: daysLabel },
  ])

  const checklistLink = args.checklistLink?.trim() || null

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(bannerTitle)}
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

                  ${infoTable}

                  ${
                    pendingSigners.length > 0
                      ? renderPendingSignersHtml(pendingSigners)
                      : ""
                  }

                  ${
                    checklistLink
                      ? `
                    ${wrapWithBottomSpacing(
                      `
                    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};">
                          <a
                            href="${escapeHtml(checklistLink)}"
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

                    <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                      Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                    </p>
                    <p style="margin:0;word-break:break-all;">
                      <a href="${escapeHtml(checklistLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                        ${escapeHtml(checklistLink)}
                      </a>
                    </p>
                    `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    args.employmentEndDate
      ? `Konec pracovního poměru: ${fmtDate(args.employmentEndDate)}`
      : "",
    `Zbývá: ${daysLabel}`,
    ...renderPendingSignersText(pendingSigners),
    "",
    checklistLink ? `Odkaz: ${checklistLink}` : "",
    "",
    ...renderHrContactsText(),
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

export async function sendExitChecklistLockedIncompleteHrEmail(args: {
  to: string[]
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  employmentEndDate?: string | Date | null
  checklistLink?: string | null
  pendingSigners?: ExitChecklistPendingSigner[] | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)
  const pendingSigners = (args.pendingSigners ?? []).filter(
    (signer) => signer && signer.name
  )

  if (!recipients.length) return

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Výstupní list byl uzamčen, ale ne všichni podepsali – ${args.employeeName}`

  const intro = `výstupní list níže uvedeného zaměstnance byl po potvrzení skutečného odchodu automaticky uzamčen, ale ne všichni podepisující ho stihli podepsat. Prosíme o kontrolu.`

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    {
      label: "Konec pracovního poměru",
      value: fmtDate(args.employmentEndDate),
    },
  ])

  const checklistLink = args.checklistLink?.trim() || null

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Výstupní list&nbsp;·&nbsp;Upozornění pro HR
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(subject)}
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

                  ${infoTable}

                  ${pendingSigners.length > 0 ? renderPendingSignersHtml(pendingSigners) : ""}

                  ${
                    checklistLink
                      ? wrapWithBottomSpacing(
                          `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(checklistLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít výstupní list
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                          4
                        )
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    `Konec pracovního poměru: ${fmtDate(args.employmentEndDate)}`,
    "",
    ...renderPendingSignersText(pendingSigners),
    "",
    checklistLink ? `Odkaz: ${checklistLink}` : "",
    "",
    ...renderHrContactsText(),
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

export async function sendOffboardingDepartureConfirmationEmail(args: {
  to: string[]
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  plannedEnd?: string | Date | null
  odchodyLink?: string | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const subject = `Proběhl odchod zaměstnance? – ${args.employeeName}`

  const intro = `plánovaný konec pracovního poměru níže uvedeného zaměstnance už uplynul, ale v aplikaci zatím nikdo nepotvrdil, jestli k odchodu skutečně došlo. Prosíme o potvrzení v přehledu Odchodů – buď potvrďte skutečný odchod, nebo ho označte jako neuskutečněný.`

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: "Plánovaný konec", value: fmtDate(args.plannedEnd) },
  ])

  const odchodyLink = args.odchodyLink?.trim() || null

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Odchod zaměstnance&nbsp;·&nbsp;Potvrzení
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Proběhl odchod zaměstnance? – ${escapeHtml(args.employeeName)}
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

                  ${infoTable}

                  ${
                    odchodyLink
                      ? `
                    ${wrapWithBottomSpacing(
                      `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(odchodyLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít přehled Odchodů
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
                      <a href="${escapeHtml(odchodyLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                        ${escapeHtml(odchodyLink)}
                      </a>
                    </p>
                    `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    args.plannedEnd ? `Plánovaný konec: ${fmtDate(args.plannedEnd)}` : "",
    odchodyLink ? `Odkaz: ${odchodyLink}` : "",
    "",
    ...renderHrContactsText(),
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

export type SystemNotificationAction =
  | "employee_onboarding_deleted"
  | "employee_offboarding_deleted"
  | "employee_restored"

const SYSTEM_NOTIFICATION_BODY: Record<SystemNotificationAction, string> = {
  employee_onboarding_deleted: "byl smazán záznam nástupu zaměstnance.",
  employee_offboarding_deleted: "byl smazán záznam odchodu zaměstnance.",
  employee_restored: "byl obnoven dříve smazaný záznam zaměstnance.",
}

export async function sendSystemNotificationEmail(args: {
  to: string[]
  subject: string
  action: SystemNotificationAction
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  actorName?: string | null
  actionAt?: string | Date | null
  restoredAt?: string | Date | null
  originalDeletedBy?: string | null
  originalDeleteReason?: string | null
  recordLink?: string | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const intro =
    SYSTEM_NOTIFICATION_BODY[args.action] ??
    "jde o systémové oznámení z aplikace."
  const actionAt = args.actionAt ?? args.restoredAt

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: "Uživatel", value: args.actorName || "Neznámý uživatel" },
    { label: "Datum a čas", value: fmtDateTime(actionAt) },
    ...(args.action === "employee_restored"
      ? [
          { label: "Uživatel (smazání)", value: args.originalDeletedBy },
          { label: "Důvod smazání", value: args.originalDeleteReason },
        ]
      : []),
  ])

  const recordLink = args.recordLink?.trim() || null

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
      <title>${escapeHtml(args.subject)}</title>
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Systémové oznámení
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(args.subject)}
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

                  ${infoTable}

                  ${
                    recordLink
                      ? wrapWithBottomSpacing(
                          `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(recordLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít záznam
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                          4
                        )
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    `Uživatel: ${args.actorName || "Neznámý uživatel"}`,
    `Datum a čas: ${fmtDateTime(actionAt)}`,
    ...(args.action === "employee_restored"
      ? [
          args.originalDeletedBy
            ? `Uživatel (smazání): ${args.originalDeletedBy}`
            : "",
          args.originalDeleteReason
            ? `Důvod smazání: ${args.originalDeleteReason}`
            : "",
        ]
      : []),
    "",
    recordLink ? `Odkaz: ${recordLink}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: recipients,
    subject: args.subject,
    html,
    text,
  })
}

type NewRecordKind = "ONBOARDING" | "OFFBOARDING"

const NEW_RECORD_KIND_LABELS: Record<
  NewRecordKind,
  { banner: string; noun: string; dateLabel: string; buttonLabel: string }
> = {
  ONBOARDING: {
    banner: "Nástup zaměstnance",
    noun: "nástup",
    dateLabel: "Plánovaný nástup",
    buttonLabel: "Otevřít nástup",
  },
  OFFBOARDING: {
    banner: "Odchod zaměstnance",
    noun: "odchod",
    dateLabel: "Plánovaný odchod",
    buttonLabel: "Otevřít odchod",
  },
}

export async function sendNewRecordMissingManagerEmail(args: {
  to: string[]
  kind: NewRecordKind
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  plannedDate?: string | Date | null
  recordLink?: string | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const labels = NEW_RECORD_KIND_LABELS[args.kind]
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const subject = `Chybí vedoucí odboru – nový ${labels.noun} – ${args.employeeName}`

  const intro = `byl zaevidován nový předpokládaný ${labels.noun}, u kterého zatím není vyplněný vedoucí odboru. Dokud nebude vedoucí doplněn, nedostane o tomto zaměstnanci/zaměstnankyni žádnou informaci. Prosíme o doplnění vedoucího odboru u záznamu.`

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: labels.dateLabel, value: fmtDate(args.plannedDate) },
  ])

  const recordLink = args.recordLink?.trim() || null

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    ${labels.banner}&nbsp;·&nbsp;Nový záznam
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Chybí vedoucí odboru – ${escapeHtml(args.employeeName)}
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

                  ${infoTable}

                  ${
                    recordLink
                      ? `
                    ${wrapWithBottomSpacing(
                      `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(recordLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            ${labels.buttonLabel}
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
                      <a href="${escapeHtml(recordLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                        ${escapeHtml(recordLink)}
                      </a>
                    </p>
                    `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    args.plannedDate ? `${labels.dateLabel}: ${fmtDate(args.plannedDate)}` : "",
    recordLink ? `Odkaz: ${recordLink}` : "",
    "",
    ...renderHrContactsText(),
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

export async function sendNewRecordManagerNoticeEmail(args: {
  to: string[]
  kind: NewRecordKind
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  plannedDate?: string | Date | null
  recordLink: string
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const labels = NEW_RECORD_KIND_LABELS[args.kind]
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const subject = `Byl zaevidován nový předpokládaný ${labels.noun} – ${args.employeeName}`

  const intro = `byl zaevidován nový předpokládaný ${labels.noun}, u kterého jste přiřazeni jako vedoucí odboru:`

  const loginNote = `Pro zobrazení podrobností se přihlaste svým firemním Google účtem (@praha6.cz) – většina vedoucích má v aplikaci přístup v režimu pouze pro čtení. Pokud se po přihlášení do aplikace nedostanete, obraťte se na administrátora aplikace, případně na Personální oddělení (kontakty níže). Pokud potřebujete více informací, můžete si zobrazit tento ${labels.noun} v aplikaci.`

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: labels.dateLabel, value: fmtDate(args.plannedDate) },
  ])

  const recordLink = args.recordLink.trim()

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    ${labels.banner}&nbsp;·&nbsp;Nový záznam
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Byl zaevidován nový předpokládaný ${labels.noun} – ${escapeHtml(args.employeeName)}
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

                  ${infoTable}

                  ${wrapWithBottomSpacing(
                    `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(recordLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            ${labels.buttonLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                    18
                  )}

                  ${renderAppLoginInfoBoxHtml(loginNote)}

                  <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                    Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                  </p>
                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(recordLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(recordLink)}
                    </a>
                  </p>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    args.plannedDate ? `${labels.dateLabel}: ${fmtDate(args.plannedDate)}` : "",
    `Odkaz: ${recordLink}`,
    "",
    loginNote,
    "",
    ...renderHrContactsText(),
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

type NewRecordUpdateReason =
  | "FIELDS_CHANGED"
  | "MANAGER_REMOVED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"
  | "RECORD_RESTORED"

export async function sendNewRecordManagerUpdateEmail(args: {
  to: string[]
  kind: NewRecordKind
  reason: NewRecordUpdateReason
  changeSummary?: string[] | null
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
  plannedDate?: string | Date | null
  recordLink?: string | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const labels = NEW_RECORD_KIND_LABELS[args.kind]
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const changeSummary = (args.changeSummary ?? []).filter(Boolean)

  let subject: string
  let intro: string

  switch (args.reason) {
    case "MANAGER_REMOVED":
      subject = `Byli jste odebráni jako vedoucí odboru – ${args.employeeName}`
      intro = `u níže uvedeného předpokládaného ${labels.noun}u jste byli odebráni jako vedoucí odboru. Nebudete již nadále dostávat informace k tomuto záznamu.`
      break
    case "RECORD_CANCELLED":
      subject = `Zrušen předpokládaný ${labels.noun} – ${args.employeeName}`
      intro = `předpokládaný ${labels.noun} níže uvedeného zaměstnance, u kterého jste uvedeni jako vedoucí odboru, byl přesunut do neuskutečněných, tedy k danému ${labels.noun}u nedojde.`
      break
    case "RECORD_DELETED":
      subject = `Smazán záznam předpokládaného ${labels.noun}u – ${args.employeeName}`
      intro = `předpokládaný ${labels.noun} níže uvedeného zaměstnance, u kterého jste uvedeni jako vedoucí odboru, byl smazán.`
      break
    case "RECORD_RESTORED":
      subject = `Obnoven předpokládaný ${labels.noun} – ${args.employeeName}`
      intro = `předpokládaný ${labels.noun} níže uvedeného zaměstnance, u kterého jste uvedeni jako vedoucí odboru, byl obnoven a je znovu aktivní.`
      break
    default:
      subject = `Změna u ${labels.noun}u, kde jste uvedeni jako vedoucí – ${args.employeeName}`
      intro = `u níže uvedeného předpokládaného ${labels.noun}u, u kterého jste uvedeni jako vedoucí odboru, došlo ke změně.`
  }

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: labels.dateLabel, value: fmtDate(args.plannedDate) },
  ])

  const showLink = args.reason !== "MANAGER_REMOVED"
  const recordLink = showLink ? args.recordLink?.trim() || null : null
  const loginNote = `Pro zobrazení podrobností se přihlaste svým firemním Google účtem (@praha6.cz) – většina vedoucích má v aplikaci přístup v režimu pouze pro čtení. Pokud se po přihlášení do aplikace nedostanete, obraťte se na administrátora aplikace, případně na Personální oddělení (kontakty níže). Pokud potřebujete více informací, můžete si zobrazit tento ${labels.noun} v aplikaci.`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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

              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    ${labels.banner}&nbsp;·&nbsp;Aktualizace záznamu
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(subject)}
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

                  ${infoTable}

                  ${
                    changeSummary.length > 0
                      ? renderAgendaItemsBoxHtml(
                          "Co se změnilo:",
                          changeSummary,
                          bgLight
                        )
                      : ""
                  }

                  ${
                    recordLink
                      ? wrapWithBottomSpacing(
                          `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(recordLink)}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            ${labels.buttonLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                          18
                        )
                      : ""
                  }

                  ${recordLink ? renderAppLoginInfoBoxHtml(loginNote) : ""}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    args.plannedDate ? `${labels.dateLabel}: ${fmtDate(args.plannedDate)}` : "",
    changeSummary.length > 0
      ? [
          "",
          "Co se změnilo:",
          ...changeSummary.map((line) => `- ${line}`),
        ].join("\n")
      : "",
    recordLink ? `Odkaz: ${recordLink}` : "",
    "",
    ...renderHrContactsText(),
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
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Zkušební doba<span style="opacity:.6;">&nbsp;·&nbsp;</span>PDF příloha
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyhodnocení zkušební doby${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    ${escapeHtml(
                      args.intro?.trim() ||
                        "Personální oddělení vám zasílá PDF přílohu formuláře Vyhodnocení zkušební doby níže uvedeného zaměstnance."
                    )}
                  </p>

                  ${renderProbationInfoTable({
                    primary,
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                    probationEndDate: args.probationEndDate,
                    supervisorName: args.supervisorName,
                    supervisorEmail: args.supervisorEmail,
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

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    args.intro?.trim() ||
      "Personální oddělení vám zasílá PDF přílohu formuláře Vyhodnocení zkušební doby níže uvedeného zaměstnance.",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.supervisorName ? `Vedoucí / hodnotitel: ${args.supervisorName}` : "",
    args.supervisorEmail ? `E-mail vedoucího: ${args.supervisorEmail}` : "",
    args.recommendation ? `Doporučení: ${args.recommendation}` : "",
    args.evaluatorName ? `Hodnotitel: ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    args.message ? `Zpráva: ${args.message}` : "",
    "",
    ...renderHrContactsText(),
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

export async function sendProbationEvaluationTajemnikReviewRequestEmail(
  args: SendProbationEvaluationTajemnikReviewRequestEmailParams
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Vyhodnocení zkušební doby – vyjádření tajemníka – ${args.employeeName}`
  const greeting = "Dobrý den,"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Zkušební doba<span style="opacity:.6;">&nbsp;·&nbsp;</span>Vyjádření tajemníka
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyhodnocení zkušební doby${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    ${escapeHtml(greeting)}
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    formulář Vyhodnocení zkušební doby níže uvedeného zaměstnance byl vyplněn. Vyplněný formulář naleznete v PDF příloze. Prosíme o vyjádření (souhlas/nesouhlas s doporučením) přes odkaz níže.
                  </p>

                  ${renderProbationInfoTable({
                    primary,
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                    probationEndDate: args.probationEndDate,
                    supervisorName: args.supervisorName,
                    supervisorEmail: args.supervisorEmail,
                    recommendation: args.recommendation,
                    evaluatorName: args.evaluatorName,
                    evaluatorEmail: args.evaluatorEmail,
                  })}

                  ${wrapWithBottomSpacing(
                    `
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                        <a
                          href="${escapeHtml(args.evaluationLink)}"
                          style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                        >
                          Otevřít k vyjádření
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
                    <a href="${escapeHtml(args.evaluationLink)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(args.evaluationLink)}
                    </a>
                  </p>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    `Formulář Vyhodnocení zkušební doby níže uvedeného zaměstnance byl vyplněn. Vyplněný formulář naleznete v PDF příloze. Prosíme o vyjádření (souhlas/nesouhlas s doporučením) přes odkaz níže.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.supervisorName ? `Vedoucí / hodnotitel: ${args.supervisorName}` : "",
    args.supervisorEmail ? `E-mail vedoucího: ${args.supervisorEmail}` : "",
    args.recommendation ? `Doporučení: ${args.recommendation}` : "",
    args.evaluatorName ? `Hodnotitel: ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    `Odkaz: ${args.evaluationLink}`,
    "",
    ...renderHrContactsText(),
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

export async function sendTajemnikReviewCompletedToSupervisorEmail(
  args: SendTajemnikReviewCompletedToSupervisorEmailParams
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Vyhodnocení zkušební doby – tajemník se vyjádřil – ${args.employeeName}`

  const agreementText =
    args.tajemnikAgreement === "no"
      ? "nesouhlasí s Vaším doporučením"
      : "souhlasí s Vaším doporučením"

  const intro = `tajemník${args.tajemnikName ? ` ${args.tajemnikName}` : " úřadu"} se vyjádřil k Vámi vyplněnému vyhodnocení zkušební doby níže uvedeného zaměstnance – ${agreementText}. Vyhodnocení bylo v této podobě předáno Personálnímu oddělení k založení${args.pdfBuffer ? ", finální PDF naleznete v příloze" : ""}.`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Zkušební doba<span style="opacity:.6;">&nbsp;·&nbsp;</span>Vyjádření tajemníka
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyhodnocení zkušební doby${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
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
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                    probationEndDate: args.probationEndDate,
                    supervisorName: args.supervisorName,
                    supervisorEmail: args.supervisorEmail,
                  })}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.supervisorName ? `Vedoucí / hodnotitel: ${args.supervisorName}` : "",
    args.supervisorEmail ? `E-mail vedoucího: ${args.supervisorEmail}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: [args.to],
    subject,
    html,
    text,
    ...(args.pdfBuffer
      ? {
          attachments: [
            {
              filename: args.pdfFilename || "Vyhodnoceni-zkusebni-doby.pdf",
              content: args.pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
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
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Zkušební doba<span style="opacity:.6;">&nbsp;·&nbsp;</span>Dokončeno
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyhodnocení zkušební doby${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
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
                    employeePersonalNumber: args.employeePersonalNumber,
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
                      ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">Uloženo: ${escapeHtml(args.completedByName.trim())}</p>`
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    args.evaluatorName ? `Hodnotitel: ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    args.completedByName ? `Uloženo: ${args.completedByName}` : "",
    "",
    ...renderHrContactsText(),
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
  const employeePersonalNumber = payload.employeePersonalNumber ?? null
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
      employeePersonalNumber,
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
      employeePersonalNumber,
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
      employeePersonalNumber,
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
      employeePersonalNumber,
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
      employeePersonalNumber,
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

  if (type === "PROBATION_EVALUATION_UNLOCK_REMINDER") {
    await sendProbationNotificationEmail({
      to: recipients,
      subject:
        payload.subject ||
        `Formulář vyhodnocení zkušební doby je stále odemčený – ${employeeName}`,
      headerLabel: "Upozornění",
      intro:
        payload.intro ||
        "Formulář vyhodnocení zkušební doby byl odemčen k opravě a stále zůstává otevřený. Prosíme, dokončete úpravy a formulář znovu uzamkněte.",
      employeeName,
      employeePersonalNumber,
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
  managerName?: string | null
  managerPosition?: string | null
  managerDepartment?: string | null
  cancelled?: boolean
}

export async function sendHandoverRecipientEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  option3Reason,
  managerName,
  managerPosition,
  managerDepartment,
  cancelled = false,
}: SendHandoverRecipientEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = cancelled
    ? `Zrušení odpovědnosti za dokumenty – ${employeeName}`
    : `Informace k předávané agendě – ${employeeName}`

  const reasonText = option3Reason?.trim()
    ? option3Reason.trim()
    : "dle údajů uvedených ve výstupním listu"

  const managerLabel = managerName
    ? `${managerName}${
        managerPosition || managerDepartment
          ? ` (${[managerPosition, managerDepartment].filter(Boolean).join(" - ")})`
          : ""
      }`
    : null

  const leadHtml = cancelled
    ? `ve výstupním listu níže uvedeného zaměstnance byla zrušena vaše
               odpovědnost za dokumenty v části
               <strong>„Za dokumenty odpovídá“</strong>
               (dříve z důvodu: <strong>${reasonText}</strong>):`
    : `ve výstupním listu níže uvedeného zaměstnance byli jste vybráni jako
               pověřená osoba k převzetí agendy v části
               <strong>„Za dokumenty odpovídá“</strong>:`

  const leadText = cancelled
    ? `ve výstupním listu níže uvedeného zaměstnance byla zrušena vaše odpovědnost za dokumenty v části „Za dokumenty odpovídá“ (dříve z důvodu: ${reasonText}):`
    : `ve výstupním listu níže uvedeného zaměstnance byli jste vybráni jako pověřená osoba k převzetí agendy v části „Za dokumenty odpovídá“:`

  const afterTableHtml = cancelled
    ? `${
        managerLabel
          ? `U vedoucího odboru <strong>${managerLabel}</strong> byl potvrzen
               jiný způsob předání agendy.`
          : "Byl potvrzen jiný způsob předání agendy."
      } Žádné další kroky z vaší strany už nejsou potřeba.`
    : null

  const afterTableText = cancelled
    ? `${managerLabel ? `U vedoucího odboru ${managerLabel} byl potvrzen jiný způsob předání agendy.` : "Byl potvrzen jiný způsob předání agendy."} Žádné další kroky z vaší strany už nejsou potřeba.`
    : null

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
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

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${leadHtml}
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
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

                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Vedoucí odboru
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${managerLabel || "—"}
                  </td>
                </tr>
              </table>
              `,
                24
              )}

              ${
                afterTableHtml
                  ? `<p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${afterTableHtml}
              </p>`
                  : ""
              }

              ${
                cancelled
                  ? ""
                  : `<p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                Agenda zatím zůstává na neobsazeném funkčním místě z důvodu:
                <strong>${reasonText}</strong>.
                ${
                  managerLabel
                    ? `Vedoucí odboru <strong>${managerLabel}</strong> určil,`
                    : "Bylo určeno,"
                }
                že za dokumenty do obsazení místa odpovídáte vy.
              </p>`
              }

              ${
                cancelled
                  ? `<p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                Pokud je něco v nepořádku, kontaktujte Personální oddělení.
              </p>`
                  : `<p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                Prosíme, ověřte si v rámci svého odboru nebo s příslušným vedoucím,
                jaké konkrétní dokumenty nebo agenda se vás týkají.
              </p>

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                Tento e-mail slouží jako informativní oznámení k výstupnímu listu.
                Samotné předání dokumentů v e-spisu nebo další navazující kroky
                se řídí interním postupem.
              </p>`
              }

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Zpráva byla odeslána prostřednictvím aplikace On-Off-Boarding ÚMČ Praha&nbsp;6.
              </p>
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    leadText,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    `Vedoucí odboru: ${managerLabel || "—"}`,
    "",
    afterTableText || "",
    cancelled
      ? ""
      : `Agenda zatím zůstává na neobsazeném funkčním místě z důvodu: ${reasonText}. ${
          managerLabel
            ? `Vedoucí odboru ${managerLabel} určil,`
            : "Bylo určeno,"
        } že za dokumenty do obsazení místa odpovídáte vy.`,
    "",
    cancelled
      ? "Pokud je něco v nepořádku, kontaktujte Personální oddělení."
      : "Prosíme, ověřte si v rámci svého odboru nebo s příslušným vedoucím, jaké konkrétní dokumenty nebo agenda se vás týkají.",
    cancelled
      ? ""
      : "Tento e-mail slouží jako informativní oznámení k výstupnímu listu.",
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

type SendHandoverKitt6EmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  targetPositionNum?: string | null
  targetPositionName?: string | null
  targetDepartment?: string | null
  managerName?: string | null
  managerPosition?: string | null
  managerDepartment?: string | null
  cancelled?: boolean
}

export async function sendHandoverKitt6Email({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  targetPositionNum,
  targetPositionName,
  targetDepartment,
  managerName,
  managerPosition,
  managerDepartment,
  cancelled = false,
}: SendHandoverKitt6EmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = cancelled
    ? `Zrušení předání agendy při odchodu zaměstnance – ${employeeName}`
    : `Předání agendy při odchodu zaměstnance – ${employeeName}`

  const managerLabel = managerName
    ? `${managerName}${
        managerPosition || managerDepartment
          ? ` (${[managerPosition, managerDepartment].filter(Boolean).join(" - ")})`
          : ""
      }`
    : null

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                ${cancelled ? "Předání agendy zrušeno" : "Předání agendy při odchodu zaměstnance"}
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                ve výstupním listu níže uvedeného zaměstnance:
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                    Zaměstnanec
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${escapeHtml(employeeName)}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Pozice
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(employeePosition || "—")}
                  </td>
                </tr>

                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(employeeDepartment || "—")}
                  </td>
                </tr>

                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Datum odchodu
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(employmentEndDate || "—")}
                  </td>
                </tr>

                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Vedoucí odboru
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(managerLabel || "—")}
                  </td>
                </tr>
              </table>
              `,
                cancelled ? 24 : 12
              )}

              <p style="margin:0 0 ${cancelled ? 0 : 18}px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${
                  cancelled
                    ? managerLabel
                      ? `Vedoucí odboru <strong>${escapeHtml(managerLabel)}</strong> zrušil
                dříve zvolené předání agendy na jiné funkční místo –
                zajištění KITT6, a potvrdil jiný způsob předání.`
                      : `Dříve zvolené předání agendy na jiné funkční místo
                (zajišťované KITT6) bylo zrušeno a byl potvrzen jiný způsob
                předání.`
                    : managerLabel
                      ? `Vedoucí odboru <strong>${escapeHtml(managerLabel)}</strong> v rámci
                tohoto výstupního listu zvolil předání na jiné funkční místo
                – zajištění provede KITT6.`
                      : `V rámci tohoto výstupního listu bylo zvoleno předání
                na jiné funkční místo – zajištění provede KITT6.`
                }
              </p>

              ${
                cancelled
                  ? ""
                  : wrapWithBottomSpacing(
                      `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                <tr>
                  <td colspan="2" style="padding:8px 16px;font-size:11px;font-weight:700;color:#082B2A;background-color:#EEF2FF;text-transform:uppercase;letter-spacing:1px;">
                    Jiné funkční místo
                  </td>
                </tr>
                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;width:160px;">
                    Číslo
                  </td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#082B2A;">
                    ${escapeHtml(targetPositionNum || "—")}
                  </td>
                </tr>
                <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Název
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(targetPositionName || "—")}
                  </td>
                </tr>
                <tr bgcolor="#ffffff" style="background-color:#ffffff;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                    Odbor
                  </td>
                  <td style="padding:10px 16px;font-size:14px;color:#374151;">
                    ${escapeHtml(targetDepartment || "—")}
                  </td>
                </tr>
              </table>
              `,
                      24
                    )
              }

              ${
                cancelled
                  ? ""
                  : `<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                Prosíme o zajištění předání agendy na uvedené místo.
              </p>`
              }
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    "Ve výstupním listu níže uvedeného zaměstnance:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    `Vedoucí odboru: ${managerLabel || "—"}`,
    "",
    cancelled
      ? managerLabel
        ? `Vedoucí odboru ${managerLabel} zrušil dříve zvolené předání agendy na jiné funkční místo – zajištění KITT6, a potvrdil jiný způsob předání.`
        : "Dříve zvolené předání agendy na jiné funkční místo (zajišťované KITT6) bylo zrušeno a byl potvrzen jiný způsob předání."
      : managerLabel
        ? `Vedoucí odboru ${managerLabel} v rámci tohoto výstupního listu zvolil předání na jiné funkční místo – zajištění provede KITT6.`
        : "V rámci tohoto výstupního listu bylo zvoleno předání na jiné funkční místo – zajištění provede KITT6.",
    "",
    cancelled ? "" : "JINÉ FUNKČNÍ MÍSTO",
    cancelled ? "" : `Číslo: ${targetPositionNum || "—"}`,
    cancelled ? "" : `Název: ${targetPositionName || "—"}`,
    cancelled ? "" : `Odbor: ${targetDepartment || "—"}`,
    "",
    cancelled ? "" : "Prosíme o zajištění předání agendy na uvedené místo.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export type ExitChecklistSignatureNoLongerNeededReason =
  | "CONFLICT_RESOLVED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"
  | "LOCKED"

const EXIT_CHECKLIST_NO_LONGER_NEEDED_CONTENT: Record<
  ExitChecklistSignatureNoLongerNeededReason,
  { subjectTag: string; bannerTitle: string; introLead: string }
> = {
  CONFLICT_RESOLVED: {
    subjectTag: "",
    bannerTitle: "Podpis již není potřeba",
    introLead: "u výstupního listu zaměstnance byl zrušen střet zájmů",
  },
  RECORD_CANCELLED: {
    subjectTag: " (odchod zrušen)",
    bannerTitle: "Odchod přesunut mezi neuskutečněné",
    introLead:
      "níže uvedený odchod zaměstnance byl přesunut mezi neuskutečněné",
  },
  RECORD_DELETED: {
    subjectTag: " (záznam smazán)",
    bannerTitle: "Záznam odchodu byl smazán",
    introLead: "níže uvedený záznam odchodu zaměstnance byl smazán",
  },
  LOCKED: {
    subjectTag: " (výstupní list uzamčen)",
    bannerTitle: "Výstupní list byl uzamčen",
    introLead: "níže uvedený výstupní list byl uzamčen a již ho nelze podepsat",
  },
}

export async function sendExitChecklistSignatureNoLongerNeededEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  reason,
  isManager,
  behalfName,
  behalfPosition,
  behalfDepartment,
  pendingItems,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  reason: ExitChecklistSignatureNoLongerNeededReason
  isManager?: boolean
  behalfName?: string | null
  behalfPosition?: string | null
  behalfDepartment?: string | null
  pendingItems?: string[] | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const content = EXIT_CHECKLIST_NO_LONGER_NEEDED_CONTENT[reason]
  const subject = `Podpis výstupního listu již není potřeba${content.subjectTag} – ${employeeName}`

  const secondSentence =
    isManager && behalfName
      ? "Už není potřeba, abyste výstupní list podepisovali v zastoupení za vedoucího odboru:"
      : isManager
        ? "Už není potřeba, abyste výstupní list podepisovali jako vedoucí odboru."
        : behalfName
          ? "Už není potřeba, abyste výstupní list podepisovali v zastoupení za:"
          : "Už není potřeba, abyste výstupní list podepisovali."

  const items = (pendingItems ?? []).filter(Boolean)

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                ${escapeHtml(content.bannerTitle)}
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${escapeHtml(content.introLead)}:
              </p>

              ${renderExitChecklistInfoTable({
                primary,
                bgLight,
                employeeName,
                employeePosition,
                employeeDepartment,
                employmentEndDate,
              })}

              <p style="margin:0 0 10px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${escapeHtml(secondSentence)}
              </p>

              ${
                behalfName
                  ? renderBehalfPersonTableHtml({
                      nameLabel: "Zastupujete za",
                      name: behalfName,
                      position: behalfPosition,
                      department: behalfDepartment,
                    })
                  : ""
              }

              ${
                items.length > 0
                  ? renderAgendaItemsBoxHtml(
                      "Agenda, kterou jste měli podepsat:",
                      items,
                      bgLight
                    )
                  : ""
              }

              ${renderInfoBubbleHtml({
                bgLight: "#fef3c7",
                borderColor: "#fde68a",
                titleColor: "#92400e",
                title: "Poznámka",
                bodyHtml: `
                <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                  Odkaz k podpisu, který jste dříve obdrželi, už není aktivní.
                </p>
                `,
              })}
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    `${content.introLead}:`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    secondSentence,
    ...(behalfName
      ? [
          `Zastupujete za: ${behalfName}`,
          `Funkce: ${behalfPosition || "—"}`,
          `Odbor/oddělení: ${behalfDepartment || "—"}`,
        ]
      : []),
    "",
    ...(items.length > 0
      ? agendaItemsTextLines("Agenda, kterou jste měli podepsat:", items)
      : []),
    "Poznámka:",
    "Odkaz k podpisu, který jste dříve obdrželi, už není aktivní.",
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export async function sendExitChecklistSignatureAvailableAgainEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  isManager,
  behalfName,
  behalfPosition,
  behalfDepartment,
  pendingItems,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  signUrl: string
  isManager?: boolean
  behalfName?: string | null
  behalfPosition?: string | null
  behalfDepartment?: string | null
  pendingItems?: string[] | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Výstupní list byl odemčen – můžete podepsat – ${employeeName}`

  const secondSentence =
    isManager && behalfName
      ? "Znovu můžete podepisovat výstupní list v zastoupení za vedoucího odboru:"
      : isManager
        ? "Znovu můžete podepisovat výstupní list jako vedoucí odboru."
        : behalfName
          ? "Znovu můžete podepisovat výstupní list v zastoupení za:"
          : "Znovu můžete podepisovat výstupní list."

  const items = (pendingItems ?? []).filter(Boolean)

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Výstupní list byl odemčen
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                níže uvedený výstupní list byl odemčen pro další úpravy a podpisy:
              </p>

              ${renderExitChecklistInfoTable({
                primary,
                bgLight,
                employeeName,
                employeePosition,
                employeeDepartment,
                employmentEndDate,
              })}

              <p style="margin:0 0 10px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${escapeHtml(secondSentence)}
              </p>

              ${
                behalfName
                  ? renderBehalfPersonTableHtml({
                      nameLabel: "Zastupujete za",
                      name: behalfName,
                      position: behalfPosition,
                      department: behalfDepartment,
                    })
                  : ""
              }

              ${
                items.length > 0
                  ? renderAgendaItemsBoxHtml(
                      "Agenda – zbývá Vám podepsat:",
                      items,
                      bgLight
                    )
                  : ""
              }

              ${renderLoginInfoBubbleHtml({ signUrl })}
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    "Níže uvedený výstupní list byl odemčen pro další úpravy a podpisy:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    secondSentence,
    ...(behalfName
      ? [
          `Zastupujete za: ${behalfName}`,
          `Funkce: ${behalfPosition || "—"}`,
          `Odbor/oddělení: ${behalfDepartment || "—"}`,
        ]
      : []),
    "",
    ...(items.length > 0
      ? agendaItemsTextLines("Agenda – zbývá Vám podepsat:", items)
      : []),
    "Přihlaste se svým firemním účtem Google (@praha6.cz).",
    "Po přihlášení budete přesměrováni na konkrétní výstupní list k podpisu.",
    "",
    `Odkaz: ${signUrl}`,
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export async function sendExitChecklistUnresolvedItemsEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  items,
  checklistUrl,
}: {
  to: string[]
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  items: ExitChecklistUnresolvedItem[]
  checklistUrl?: string | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Nevyrovnané položky výstupního listu – ${employeeName}`

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Nevyrovnané položky
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              ${renderExitChecklistInfoTable({
                primary,
                bgLight,
                employeeName,
                employeePosition,
                employeeDepartment,
                employmentEndDate,
              })}

              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.6;">
                u výstupního listu byly nově označeny jako <strong>nevyrovnané</strong> tyto položky:
              </p>

              ${renderExitChecklistUnresolvedAlertHtml(items)}

              ${
                checklistUrl
                  ? `${wrapWithBottomSpacing(
                      `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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
                    <p style="margin:0 0 4px 0;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">
                      Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                    </p>
                    <p style="margin:0;word-break:break-all;">
                      <a href="${escapeHtml(checklistUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                        ${escapeHtml(checklistUrl)}
                      </a>
                    </p>`
                  : ""
              }

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Zpráva byla odeslána prostřednictvím aplikace On-Off-Boarding ÚMČ Praha&nbsp;6.
              </p>
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    "U výstupního listu byly nově označeny jako nevyrovnané tyto položky:",
    "",
    ...renderExitChecklistUnresolvedAlertText(items),
    checklistUrl ? `Odkaz: ${checklistUrl}` : "",
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to, subject, html, text })
}

export async function sendSignatureAccessRevokedEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  stillHasOtherAccess,
  pendingItems,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  stillHasOtherAccess?: boolean
  pendingItems?: string[] | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Podpis výstupního listu již není potřeba – ${employeeName}`

  const introParagraph = `byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:`

  const linkParagraph = stillHasOtherAccess
    ? "Nyní tedy nemáte v této roli možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní, protože jste v seznamu uvedeni i v jiné roli."
    : "Nyní tedy nemáte možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, již není aktivní."

  const pendingItemsList = (pendingItems ?? []).filter(Boolean)

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Odebráno ze seznamu k podpisu
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${introParagraph}
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
                pendingItemsList.length > 0
                  ? renderInfoBubbleHtml({
                      bgLight,
                      title: "Agenda, kterou jste dříve měli ověřit a podepsat",
                      bodyHtml: `
                <div style="font-size:13px;color:#374151;line-height:1.6;">
                  ${pendingItemsList.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                </div>
                `,
                    })
                  : ""
              }

              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                ${linkParagraph}
              </p>
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    "Byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    ...(pendingItemsList.length > 0
      ? [
          "",
          "Agenda, kterou jste dříve měli ověřit a podepsat:",
          ...pendingItemsList.map((item) => `- ${item}`),
        ]
      : []),
    "",
    linkParagraph,
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export async function sendSignatureAgendaChangedEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  addedLabels,
  removedLabels,
  remainingLabels,
  signUrl,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  addedLabels: string[]
  removedLabels: string[]
  remainingLabels: string[]
  signUrl?: string | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const hasAdded = addedLabels.length > 0
  const hasRemoved = removedLabels.length > 0
  const subject = hasAdded
    ? `Doplnění agendy k podpisu výstupního listu – ${employeeName}`
    : `Snížení rozsahu agendy k podpisu výstupního listu – ${employeeName}`

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Změna agendy k podpisu
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                u výstupního listu níže uvedeného zaměstnance, kde jste v seznamu osob k podpisu, se
                změnil rozsah agendy, kterou máte na starosti:
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
                hasAdded
                  ? renderInfoBubbleHtml({
                      bgLight: "#E5F5F2",
                      borderColor: "#bfe3dc",
                      titleColor: "#0B4A46",
                      title: "Nově vám byla přidána agenda k podpisu",
                      bodyHtml: `<div style="font-size:13px;color:#374151;line-height:1.6;">${addedLabels
                        .map((item) => `• ${escapeHtml(item)}`)
                        .join("<br/>")}</div>`,
                    })
                  : ""
              }

              ${
                hasRemoved
                  ? renderInfoBubbleHtml({
                      bgLight: "#FEF2F2",
                      borderColor: "#FCA5A5",
                      titleColor: "#7F1D1D",
                      title: "Odebrána vám byla tato agenda",
                      bodyHtml: `<div style="font-size:13px;color:#374151;line-height:1.6;">${removedLabels
                        .map((item) => `• ${escapeHtml(item)}`)
                        .join("<br/>")}</div>`,
                    })
                  : ""
              }

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${
                  remainingLabels.length > 0
                    ? `Nadále máte v seznamu přiřazenu tuto agendu: ${remainingLabels
                        .map((item) => escapeHtml(item))
                        .join(
                          ", "
                        )}. Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní.`
                    : "Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní."
                }
              </p>

              ${
                signUrl
                  ? wrapWithBottomSpacing(
                      `
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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
                      0
                    )
                  : ""
              }
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    "U výstupního listu níže uvedeného zaměstnance, kde jste v seznamu osob k podpisu, se změnil rozsah agendy, kterou máte na starosti:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    ...(hasAdded
      ? [
          "Nově vám byla přidána agenda k podpisu:",
          ...addedLabels.map((item) => `- ${item}`),
          "",
        ]
      : []),
    ...(hasRemoved
      ? [
          "Odebrána vám byla tato agenda:",
          ...removedLabels.map((item) => `- ${item}`),
          "",
        ]
      : []),
    remainingLabels.length > 0
      ? `Nadále máte v seznamu přiřazenu tuto agendu: ${remainingLabels.join(", ")}. Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní.`
      : "Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní.",
    signUrl ? "" : "",
    signUrl ? `Odkaz: ${signUrl}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export async function sendSignatureAccessRestoredEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  pendingItems,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  signUrl: string
  pendingItems?: string[] | null
}): Promise<void> {
  const pendingItemsList = (pendingItems ?? []).filter(Boolean)
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Znovu obnoveno k podpisu výstupního listu – ${employeeName}`

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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

          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Znovu obnoveno k podpisu
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                byli jste znovu zařazeni do seznamu osob k podpisu tohoto
                výstupního listu a můžete ho opět podepsat:
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
                pendingItemsList.length > 0
                  ? renderInfoBubbleHtml({
                      bgLight,
                      title: "Agenda, kterou máte ověřit a podepsat",
                      bodyHtml: `
                <div style="font-size:13px;color:#374151;line-height:1.6;">
                  ${pendingItemsList.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                </div>
                `,
                    })
                  : ""
              }

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    "Byli jste znovu zařazeni do seznamu osob k podpisu tohoto výstupního listu a můžete ho opět podepsat:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    ...(pendingItemsList.length > 0
      ? [
          "",
          "Agenda, kterou máte ověřit a podepsat:",
          ...pendingItemsList.map((item) => `- ${item}`),
        ]
      : []),
    "",
    `Odkaz: ${signUrl}`,
    "",
    ...renderHrContactsText(),
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
  pdfBuffer?: Buffer | null
  pdfFilename?: string | null
  employeeNotified?: boolean
  unresolvedItems?: ExitChecklistUnresolvedItem[]
}

export async function sendExitChecklistCompletedEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  completedByName,
  checklistUrl,
  pdfBuffer,
  pdfFilename,
  employeeNotified,
  unresolvedItems = [],
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
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
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
                    výstupní list zaměstnance
                    <strong>${escapeHtml(employeeName)}</strong>
                    byl kompletně vyplněn a podepsán.
                  </p>

                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;">
                    <tr>
                      <td bgcolor="${bgLight}" style="padding:12px 16px;border:1px solid #d9ece7;border-radius:8px;font-size:13px;color:#0B4A46;line-height:1.5;">
                        ${
                          pdfBuffer
                            ? "V příloze najdete podepsané PDF výstupního listu."
                            : `Nezapomeňte prosím zaslat podepsanou PDF verzi výstupního listu zaměstnanci.`
                        }
                        ${
                          employeeNotified
                            ? ` Zaměstnanci byla automaticky zaslána informace o dokončení a výzva k vyzvednutí zápočtového listu.`
                            : ""
                        }
                        Domluvte si se zaměstnancem předání
                        zápočtového listu a poté výstupní list prosím označte
                        jako hotový a zamkněte pro další úpravy.
                      </td>
                    </tr>
                  </table>

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
                            label: "Dokončeno",
                            value: completedByName,
                            strong: true,
                          },
                        ]
                      : [],
                  })}

                  ${renderExitChecklistUnresolvedAlertHtml(unresolvedItems)}

                  ${wrapWithBottomSpacing(
                    `
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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

                  <p style="margin:0 0 4px 0;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">
                    Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
                  </p>
                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(checklistUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(checklistUrl)}
                    </a>
                  </p>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    `výstupní list je kompletně vyplněn – ${employeeName}`,
    "",
    pdfBuffer
      ? "V příloze najdete podepsané PDF výstupního listu."
      : `Nezapomeňte prosím zaslat podepsanou PDF verzi výstupního listu zaměstnanci.`,
    employeeNotified
      ? `Zaměstnanci byla automaticky zaslána informace o dokončení a výzva k vyzvednutí zápočtového listu.`
      : "",
    `Domluvte si se zaměstnancem předání zápočtového listu a poté výstupní list prosím označte jako hotový a zamkněte pro další úpravy.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    completedByName ? `Dokončila osoba: ${completedByName}` : "",
    "",
    ...renderExitChecklistUnresolvedAlertText(unresolvedItems),
    `Odkaz: ${checklistUrl}`,
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to,
    subject,
    html,
    text,
    attachments:
      pdfBuffer && pdfFilename
        ? [
            {
              filename: pdfFilename,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : undefined,
  })
}

type SendExitChecklistCompletedToEmployeeEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  unresolvedItems?: ExitChecklistUnresolvedItem[]
}

export async function sendExitChecklistCompletedToEmployeeEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  unresolvedItems = [],
}: SendExitChecklistCompletedToEmployeeEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = "Váš výstupní list je podepsán"
  const hasUnresolved = unresolvedItems.length > 0

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                    Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                    Váš výstupní list je podepsán
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Váš výstupní list byl kompletně vyplněn a podepsán všemi
                    zúčastněnými stranami. Pro vyzvednutí zápočtového listu se
                    prosím dostavte na Personální oddělení.
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
                    hasUnresolved
                      ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;">
                      <tr>
                        <td bgcolor="#FEE2E2" style="padding:12px 16px;border:1px solid #FCA5A5;border-radius:8px;font-size:13px;color:#7F1D1D;line-height:1.5;">
                          U některých položek jste zvolili odpověď
                          <strong>„Ne“</strong> – zkontrolujte prosím níže
                          uvedené sekce, zda jsou skutečně vyřízené. Pokud ne,
                          mohlo by to ovlivnit předání zápočtového listu;
                          domluvte se na dalším postupu s Personálním
                          oddělením.
                        </td>
                      </tr>
                    </table>`
                      : ""
                  }

                  ${renderExitChecklistUnresolvedAlertHtml(unresolvedItems)}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "Váš výstupní list byl kompletně vyplněn a podepsán všemi zúčastněnými stranami. Pro vyzvednutí zápočtového listu se prosím dostavte na Personální oddělení.",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    hasUnresolved
      ? 'U některých položek jste zvolili odpověď "Ne" – zkontrolujte prosím níže uvedené sekce, zda jsou skutečně vyřízené. Pokud ne, mohlo by to ovlivnit předání zápočtového listu; domluvte se na dalším postupu s Personálním oddělením.'
      : "",
    "",
    ...renderExitChecklistUnresolvedAlertText(unresolvedItems),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

type SendExitChecklistPdfEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  message?: string | null
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
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
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
                    v příloze zasíláme PDF výstupního listu zaměstnance:
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

                  </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    greeting,
    "",
    `v příloze zasíláme PDF výstupního listu zaměstnance:`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    message ? `Zpráva: ${message}` : "",
    "",
    ...renderHrContactsText(),
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
  behalfOfPosition?: string | null
  behalfOfDepartment?: string | null
  roleNote?: string | null
  employeeName: string
  employeePosition: string
  employeeDepartment: string
  employmentEndDate: string
  signUrl: string
  obligations?: string[]
  removed?: boolean
}

export async function sendBehalfSignatureEmail({
  to,
  behalfOfName,
  behalfOfRole,
  behalfOfDisplayLabel,
  behalfOfPosition,
  behalfOfDepartment,
  roleNote,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  obligations,
  removed = false,
}: SendBehalfSignatureEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = removed
    ? `Oznámení o zrušení zástupu – ${employeeName}`
    : buildExitChecklistInviteSubject({
        employeeName,
        isPureBehalf: true,
      })

  const behalfDisplayName =
    behalfOfName || behalfOfDisplayLabel || behalfOfRole || "zodpovědnou osobu"

  const obligationsList = (obligations ?? []).filter(Boolean)

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
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
          <tr bgcolor="${primary}">
            <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
              <div style="color:#ffffff;font-size:13px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;opacity:.9;">
                Výstupní list
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                ${removed ? "Oznámení o zrušení zástupu" : escapeHtml(buildExitChecklistInviteTitle({ isPureBehalf: true }))}
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 10px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${
                  removed
                    ? "pro níže uvedený odchod zaměstnance byl odebrán Váš zástup k podpisu výstupního listu."
                    : "Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu uvedeného zaměstnance:"
                }
              </p>

              ${renderExitChecklistInfoTable({
                primary,
                bgLight,
                employeeName,
                employeePosition,
                employeeDepartment,
                employmentEndDate,
              })}

              <p style="margin:0 0 10px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${
                  removed
                    ? roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                      ? "Váš zástup za níže uvedeného vedoucího odboru byl zrušen:"
                      : "Váš zástup za níže uvedeného zaměstnance je zrušen:"
                    : "Byli jste pozváni k podpisu v zástupu za:"
                }
              </p>

              ${renderBehalfPersonTableHtml({
                nameLabel: "Zastupujete za",
                name: behalfDisplayName,
                position: behalfOfPosition,
                department: behalfOfDepartment,
              })}

              ${
                obligationsList.length > 0
                  ? renderInfoBubbleHtml({
                      bgLight,
                      title: removed
                        ? "Agenda, kterou jste dříve měli ověřit a podepsat"
                        : "Agenda, kterou máte v zastoupení ověřit a podepsat",
                      bodyHtml: `
                <div style="font-size:13px;color:#374151;line-height:1.6;">
                  ${obligationsList.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                </div>
                `,
                    })
                  : ""
              }

              ${
                removed
                  ? renderInfoBubbleHtml({
                      bgLight: "#fef3c7",
                      borderColor: "#fde68a",
                      titleColor: "#92400e",
                      title: "Poznámka",
                      bodyHtml: `
                <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                  Toto zastoupení bylo zrušeno, výše uvedenou agendu již
                  nemusíte podepisovat.
                </p>
                `,
                    })
                  : `
              ${
                obligationsList.length > 0
                  ? ""
                  : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                    ? renderAgendaItemsBoxHtml(
                        "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                        EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS,
                        bgLight
                      )
                    : roleNote
                      ? `
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
                <tr>
                  <td style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.5;color:#92400e;">
                    ${escapeHtml(roleNote)}
                  </td>
                </tr>
              </table>
              `
                      : ""
              }

              ${renderBehalfNoteHtml()}

              ${renderLoginInfoBubbleHtml({ signUrl })}
              `
              }
            </td>
          </tr>

          ${renderHrContactCardsHtml(primary)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = [
    greeting,
    "",
    removed
      ? "Pro níže uvedený odchod zaměstnance byl odebrán Váš zástup k podpisu výstupního listu."
      : "Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu uvedeného zaměstnance:",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    removed
      ? roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
        ? "Váš zástup za níže uvedeného vedoucího odboru byl zrušen:"
        : "Váš zástup za níže uvedeného zaměstnance je zrušen:"
      : "Byli jste pozváni k podpisu v zástupu za:",
    `Zastupujete za: ${behalfDisplayName}`,
    `Funkce: ${behalfOfPosition || "—"}`,
    `Odbor/oddělení: ${behalfOfDepartment || "—"}`,
    ...(obligationsList.length > 0
      ? [
          "",
          removed
            ? "Agenda, kterou jste dříve měli ověřit a podepsat:"
            : "Agenda, kterou máte v zastoupení ověřit a podepsat:",
          ...obligationsList.map((item) => `- ${item}`),
        ]
      : []),
    "",
    ...(removed
      ? [
          "Poznámka:",
          "Toto zastoupení bylo zrušeno, výše uvedenou agendu již nemusíte podepisovat.",
          "",
        ]
      : [
          ...(obligationsList.length > 0
            ? []
            : roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
              ? agendaItemsTextLines(
                  "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                  EXIT_CHECKLIST_MANAGER_AGENDA_ITEMS
                )
              : roleNote
                ? [roleNote, ""]
                : []),
          "Poznámka:",
          `Podpis pro tento zástup prosím proveďte výhradně přes tlačítko „Podepsat v zastoupení" v aplikaci, nejedná se o podpis vlastní agendy.`,
          "",
          "Pro podpis je potřeba se přihlásit firemním Google účtem @praha6.cz",
          "",
          `Odkaz: ${signUrl}`,
          "",
        ]),
    "Prosíme, neodpovídejte na tento e-mail.",
    "",
    ...renderHrContactsText(),
  ].join("\n")

  await sendMail({ to: [to], subject, html, text })
}

type EmploymentDocumentEmailInfo = {
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
}

const NEXT_STEPS_INFO_TEXT = {
  intro:
    "Vyžádejte si prosím co nejdříve výpis ze své zdravotní dokumentace u Vašeho praktického lékaře.",
  intro2:
    "Výpis je nezbytným podkladem pro provedení pracovnělékařské prohlídky, náklady za jeho vystavení Vám budou uhrazeny zaměstnavatelem po předložení potvrzení o platbě.",
  appointment:
    "Žádost o provedení pracovnělékařské prohlídky a informace k termínu vstupní prohlídky Vám zašleme samostatným e-mailem.",
}

const DOCUMENT_LINK_NOTES: Record<string, string> = {
  AFFIDAVIT: "Důležitý podklad pro řádný zápočet praxe.",
  PERSONAL_QUESTIONNAIRE: "Pro účely zpracování personální agendy.",
  PAYROLL_INFO: "Zákonné údaje pro řádné vedení mzdové agendy.",
}

const HR_CONTACTS = [
  {
    name: "Mgr. Michaela Aronová",
    role: "vedoucí Personálního oddělení",
    org: "Kancelář tajemníka, Personální oddělení",
    email: "maronova@praha6.cz",
    phone: "+420 220189350",
  },
]

function renderHrContactCardsHtml(primary: string): string {
  const cardWidth = `${Math.floor(100 / HR_CONTACTS.length)}%`

  return `
    <tr>
      <td bgcolor="#ffffff" style="padding:16px 30px 20px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#374151;border-top:1px solid #d9ece7;">
        <p style="margin:0 0 12px 0;font-family:${EMAIL_FONT_FAMILY};font-size:12px;line-height:1.5;color:#374151;">
          V případě potřeby je Vám Personální oddělení plně k dispozici.
        </p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
          <tr>
            ${HR_CONTACTS.map(
              (contact, index) => `
            <td width="${cardWidth}" valign="top" style="${index === 0 ? "" : "padding-left:6px;"}${index === HR_CONTACTS.length - 1 ? "" : "padding-right:6px;"}">
              <div style="background-color:#ffffff;border:1px solid #d9ece7;border-radius:8px;padding:10px 12px;font-size:12px;color:#374151;line-height:1.5;">
                <div style="font-weight:700;color:#082B2A;">${escapeHtml(contact.name)}</div>
                <div>${escapeHtml(contact.role)}</div>
                <div style="color:#6b7280;">${escapeHtml(contact.org)}</div>
                <div style="margin-top:4px;">
                  <a href="mailto:${escapeHtml(contact.email)}" style="color:${primary};">${escapeHtml(contact.email)}</a>
                </div>
                <div>T: ${escapeHtml(contact.phone)}</div>
              </div>
            </td>
            `
            ).join("")}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td bgcolor="${primary}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#e5f5f2;line-height:1.5;border-radius:0 0 12px 12px;">
        ${EMAIL_FOOTER_HTML}
      </td>
    </tr>
  `
}

function renderHrContactsText(): string[] {
  return [
    "V případě potřeby je Vám Personální oddělení plně k dispozici.",
    "",
    ...HR_CONTACTS.flatMap((contact) => [
      `${contact.name}, ${contact.role}`,
      `${contact.org}`,
      `${contact.email} · T: ${contact.phone}`,
      "",
    ]),
  ]
}

export async function sendEmploymentDocumentLinkEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documents: Array<{ label: string; url: string; type?: string }>
  }
): Promise<{ subject: string; html: string }> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Dokumenty k nástupu – ${args.employeeName}`
    : `Dokumenty k nástupu`
  const includesPersonalQuestionnaire = args.documents.some(
    (document) => document.type === "PERSONAL_QUESTIONNAIRE"
  )

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Dokumenty k vyplnění${args.employeeName ? ` – ${escapeHtml(args.employeeName)}` : ""}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    v souvislosti s Vaším nástupem na uvedenou pozici Vás prosíme o vyplnění následujících dokumentů. Pro jejich vyplnění prosím použijte odkazy níže v tomto e-mailu.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:24px;">
                    ${args.documents
                      .map((document, index) => {
                        const note = document.type
                          ? DOCUMENT_LINK_NOTES[document.type]
                          : undefined

                        return `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;">
                          <div style="font-size:14px;color:#082B2A;font-weight:700;">
                            ${escapeHtml(document.label)}
                          </div>
                          ${
                            note
                              ? `<div style="margin-top:2px;font-size:11px;color:#6b7280;">${escapeHtml(note)}</div>`
                              : ""
                          }
                          <div style="margin-top:6px;font-size:12px;">
                            <a href="${escapeHtml(document.url)}" style="color:${primary};word-break:break-all;">${escapeHtml(document.url)}</a>
                          </div>
                        </td>
                      </tr>
                    `
                      })
                      .join("")}
                  </table>

                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #fed7aa;border-radius:8px;overflow:hidden;border-collapse:separate;">
                    <tr bgcolor="#fff7ed" style="background-color:#fff7ed;">
                      <td style="padding:12px 14px;font-size:12px;color:#9a3412;line-height:1.6;">
                        <strong>Důležité:</strong>
                        <ul style="margin:8px 0 0 18px;padding:0;">
                          <li>Odkazy jsou určeny pouze pro vás – <strong>nepřeposílejte je</strong> dalším osobám.</li>
                          <li>Formuláře vyplňte <strong>osobně</strong>, <strong>pravdivě</strong> a <strong>pečlivě</strong>.</li>
                          <li>Po odeslání už zpravidla není potřeba dokumenty vyplňovat znovu.</li>
                          <li>Pokud jméno nebo pozice u odkazů nesouhlasí s vámi, formuláře <strong>nevyplňujte</strong> a okamžitě kontaktujte Personální oddělení.</li>
                        </ul>
                      </td>
                    </tr>
                  </table>

                  ${
                    includesPersonalQuestionnaire
                      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-top:16px;border-left:4px solid ${primary};">
                    <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                      <td style="padding:14px 16px;font-size:12px;color:#082B2A;line-height:1.6;">
                        <strong>Informace o dalším postupu</strong>
                        <p style="margin:8px 0 0 0;">
                          <strong>${escapeHtml(NEXT_STEPS_INFO_TEXT.intro)}</strong>
                          ${escapeHtml(NEXT_STEPS_INFO_TEXT.intro2)}
                        </p>
                        <p style="margin:8px 0 0 0;">
                          ${escapeHtml(NEXT_STEPS_INFO_TEXT.appointment)}
                        </p>
                      </td>
                    </tr>
                  </table>
                  `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "v souvislosti s Vaším nástupem na uvedenou pozici Vás prosíme o vyplnění následujících dokumentů. Pro jejich vyplnění prosím použijte odkazy níže v tomto e-mailu.",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    "",
    ...args.documents.flatMap((document) => {
      const note = document.type
        ? DOCUMENT_LINK_NOTES[document.type]
        : undefined

      return [document.label, ...(note ? [note] : []), document.url, ""]
    }),
    "Odkazy jsou určeny pouze pro vás – nepřeposílejte je dalším osobám.",
    ...(includesPersonalQuestionnaire
      ? [
          "",
          "Informace o dalším postupu:",
          NEXT_STEPS_INFO_TEXT.intro,
          NEXT_STEPS_INFO_TEXT.intro2,
          NEXT_STEPS_INFO_TEXT.appointment,
        ]
      : []),
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [args.to], subject, html, text })

  return { subject, html }
}

export async function sendMedicalExamRequestEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    variant: MedicalExamRequestVariant
    appointmentAt?: string | null
    selfArranged?: boolean
    attachment: { filename: string; content: Buffer }
  }
): Promise<{ subject: string; html: string }> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Žádost o pracovnělékařskou prohlídku – ${args.employeeName}`
    : `Žádost o pracovnělékařskou prohlídku`
  const steps = medicalExamInstructionSections(
    args.variant,
    args.appointmentAt ?? null,
    Boolean(args.selfArranged)
  )

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Pracovnělékařská prohlídka
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Žádost o pracovnělékařskou prohlídku${args.employeeName ? ` – ${escapeHtml(args.employeeName)}` : ""}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    v souvislosti s Vaším nástupem Vám zasíláme žádost o provedení pracovnělékařské prohlídky a posouzení zdravotní způsobilosti k práci (v příloze tohoto e-mailu ve formátu PDF). Žádost si prosím vytiskněte ve dvou vyhotoveních a vezměte s sebou na prohlídku dle instrukcí níže.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <p style="margin:18px 0 10px 0;font-size:14px;font-weight:bold;color:#082B2A;">
                    Vstupní lékařská prohlídka – postup
                  </p>

                  ${renderMedicalExamStepsCardHtml(steps)}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "v souvislosti s Vaším nástupem Vám zasíláme žádost o provedení pracovnělékařské prohlídky a posouzení zdravotní způsobilosti k práci (v příloze tohoto e-mailu ve formátu PDF). Žádost si prosím vytiskněte ve dvou vyhotoveních a vezměte s sebou na prohlídku dle instrukcí níže.",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    "",
    "Vstupní lékařská prohlídka – postup:",
    ...steps.flatMap((step) => [`${step.title}: ${step.description}`]),
    "",
    ...renderHrContactsText(),
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
        filename: args.attachment.filename,
        content: args.attachment.content,
        contentType: "application/pdf",
      },
    ],
  })

  return { subject, html }
}

type EmploymentDocumentExpiryItem = { label: string; url: string }

export async function sendEmploymentDocumentExpiryWarningEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documents: EmploymentDocumentExpiryItem[]
    expiresAt: Date
  }
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const expiresAtLabel = args.expiresAt.toLocaleDateString("cs-CZ")
  const subject = args.employeeName
    ? `Brzy vyprší odkaz k vyplnění dokumentů – ${args.employeeName}`
    : "Brzy vyprší odkaz k vyplnění dokumentů"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Upozornění
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Brzy vyprší odkaz k vyplnění dokumentů
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    platnost odkazu k vyplnění níže uvedených dokumentů brzy vyprší (${escapeHtml(expiresAtLabel)}). Prosíme o jejich vyplnění co nejdříve, po vypršení platnosti bude potřeba požádat Personální oddělení o nový odkaz.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;">
                          <div style="font-size:14px;color:#082B2A;font-weight:700;">
                            ${escapeHtml(document.label)}
                          </div>
                          <div style="margin-top:6px;font-size:12px;">
                            <a href="${escapeHtml(document.url)}" style="color:${primary};word-break:break-all;">${escapeHtml(document.url)}</a>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    `platnost odkazu k vyplnění níže uvedených dokumentů brzy vyprší (${expiresAtLabel}). Prosíme o jejich vyplnění co nejdříve, po vypršení platnosti bude potřeba požádat Personální oddělení o nový odkaz.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.flatMap((document) => [document.label, document.url, ""]),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [args.to], subject, html, text })
}

export async function sendEmploymentDocumentExpiredHrReminderEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documents: EmploymentDocumentExpiryItem[]
    onboardingLink?: string | null
  }
): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) return

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Vypršel odkaz k vyplnění dokumentů, stále nevyplněno – ${args.employeeName}`
    : "Vypršel odkaz k vyplnění dokumentů, stále nevyplněno"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Upozornění pro HR
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vypršel odkaz k vyplnění dokumentů${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    platnost odkazu k vyplnění níže uvedených dokumentů vypršela a dokumenty stále nejsou vyplněné. Pro nové odeslání je potřeba dokument nejdříve obnovit tlačítkem „Nový odkaz“.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>

                  ${
                    args.onboardingLink?.trim()
                      ? `
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:12px 0 4px 0;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                                <a
                                  href="${escapeHtml(args.onboardingLink.trim())}"
                                  style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                                >
                                  Otevřít nástup
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    `platnost odkazu k vyplnění níže uvedených dokumentů vypršela a dokumenty stále nejsou vyplněné. Pro nové odeslání je potřeba dokument nejdříve obnovit tlačítkem „Nový odkaz“.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.map((document) => document.label),
    "",
    args.onboardingLink?.trim() ? `Odkaz: ${args.onboardingLink.trim()}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: recipients, subject, html, text })
}

export async function sendEmploymentDocumentNotSentHrReminderEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documents: Array<{ label: string }>
    plannedStart: Date
    medicalExamNotSent?: boolean
    onboardingLink?: string | null
  }
): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) return

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const plannedStartLabel = args.plannedStart.toLocaleDateString("cs-CZ")

  const missingParts: string[] = []
  if (args.documents.length)
    missingParts.push("odkazy k vyplnění nástupních dokumentů")
  if (args.medicalExamNotSent)
    missingParts.push("žádost o pracovnělékařskou prohlídku")

  const missingLabel = missingParts.join(" a ") || "nástupní dokumenty"

  const subject = args.employeeName
    ? `Zatím neodesláno zaměstnanci: ${missingLabel} – ${args.employeeName}`
    : `Zatím neodesláno zaměstnanci: ${missingLabel}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Upozornění pro HR
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Zatím neodesláno zaměstnanci${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    níže uvedenému zaměstnanci s plánovaným nástupem ještě nebylo odesláno: <strong>${escapeHtml(missingLabel)}</strong>. Prosíme o odeslání co nejdříve.
                  </p>

                  ${renderInfoTable(bgLight, [
                    {
                      label: "Zaměstnanec",
                      value: args.employeeName,
                      strong: true,
                    },
                    {
                      label: "Osobní číslo",
                      value: args.employeePersonalNumber,
                    },
                    { label: "Pozice", value: args.employeePosition },
                    { label: "Odbor", value: args.employeeDepartment },
                    { label: "Oddělení", value: args.employeeUnitName },
                    { label: "Plánovaný nástup", value: plannedStartLabel },
                  ])}

                  ${
                    args.documents.length
                      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  `
                      : ""
                  }

                  ${
                    args.medicalExamNotSent
                      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                      <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                        Žádost o pracovnělékařskou prohlídku
                      </td>
                    </tr>
                  </table>
                  `
                      : ""
                  }

                  ${
                    args.onboardingLink?.trim()
                      ? `
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:12px 0 4px 0;">
                          <table border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                                <a
                                  href="${escapeHtml(args.onboardingLink.trim())}"
                                  style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                                >
                                  Otevřít nástup
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    `
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    `níže uvedenému zaměstnanci s plánovaným nástupem (${plannedStartLabel}) ještě nebylo odesláno: ${missingLabel}. Prosíme o odeslání co nejdříve.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.map((document) => document.label),
    ...(args.medicalExamNotSent
      ? ["Žádost o pracovnělékařskou prohlídku"]
      : []),
    "",
    args.onboardingLink?.trim() ? `Odkaz: ${args.onboardingLink.trim()}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: recipients, subject, html, text })
}

export type EmploymentDocumentsNoLongerNeededReason =
  | "LOCKED"
  | "RECORD_CANCELLED"
  | "RECORD_DELETED"

const EMPLOYMENT_DOCUMENTS_NO_LONGER_NEEDED_CONTENT: Record<
  EmploymentDocumentsNoLongerNeededReason,
  { subject: string; intro: string }
> = {
  LOCKED: {
    subject: "Nástupní dokumenty byly uzamčeny",
    intro:
      "následující nevyplněné nástupní dokumenty byly uzamčeny Personálním oddělením. Odkazy k vyplnění, které jste dříve obdrželi, už nejsou aktivní a dál v nich nelze pokračovat.",
  },
  RECORD_CANCELLED: {
    subject: "Nástupní dokumenty již nejsou potřeba",
    intro:
      "váš plánovaný nástup byl přesunut mezi neuskutečněné, následující nevyplněné nástupní dokumenty tedy již nemusíte vyplňovat. Odkazy k vyplnění, které jste dříve obdrželi, už nejsou aktivní.",
  },
  RECORD_DELETED: {
    subject: "Nástupní dokumenty již nejsou potřeba",
    intro:
      "váš plánovaný nástup byl smazán, následující nevyplněné nástupní dokumenty tedy již nemusíte vyplňovat. Odkazy k vyplnění, které jste dříve obdrželi, už nejsou aktivní.",
  },
}

export async function sendEmploymentDocumentsLockedEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documents: Array<{ label: string }>
    reason?: EmploymentDocumentsNoLongerNeededReason
  }
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const content =
    EMPLOYMENT_DOCUMENTS_NO_LONGER_NEEDED_CONTENT[args.reason ?? "LOCKED"]
  const subject = args.employeeName
    ? `${content.subject} – ${args.employeeName}`
    : content.subject

  const intro = content.intro

  const documentsListHtml =
    args.documents.length > 0
      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  `
      : ""

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${content.subject}
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

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  ${documentsListHtml}

                  ${
                    (args.reason ?? "LOCKED") === "LOCKED"
                      ? renderInfoBubbleHtml({
                          bgLight: "#fef3c7",
                          borderColor: "#fde68a",
                          titleColor: "#92400e",
                          title: "Poznámka",
                          bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      Pokud potřebujete v dokumentech cokoliv upravit, kontaktujte Personální oddělení.
                    </p>
                    `,
                        })
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.map((document) => document.label),
    "",
    ...((args.reason ?? "LOCKED") === "LOCKED"
      ? [
          "Poznámka:",
          "Pokud potřebujete v dokumentech cokoliv upravit, kontaktujte Personální oddělení.",
          "",
        ]
      : []),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [args.to], subject, html, text })
}

export type EmploymentDocumentsAvailableAgainReason =
  | "UNLOCKED"
  | "RECORD_RESTORED"

const EMPLOYMENT_DOCUMENTS_AVAILABLE_AGAIN_CONTENT: Record<
  EmploymentDocumentsAvailableAgainReason,
  { subject: string; intro: string }
> = {
  UNLOCKED: {
    subject: "Nástupní dokumenty byly odemčeny",
    intro:
      "nástupní dokumenty byly odemčeny Personálním oddělením. Odkazy k vyplnění níže uvedených dokumentů jsou znovu aktivní a můžete v nich pokračovat.",
  },
  RECORD_RESTORED: {
    subject: "Nástupní dokumenty jsou znovu aktivní",
    intro:
      "váš plánovaný nástup byl obnoven a je znovu aktivní. Odkazy k vyplnění níže uvedených nevyplněných dokumentů jsou znovu aktivní a můžete v nich pokračovat.",
  },
}

export async function sendEmploymentDocumentsUnlockedEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documents: Array<{ label: string; url: string }>
    reason?: EmploymentDocumentsAvailableAgainReason
    extraNote?: string | null
  }
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const content =
    EMPLOYMENT_DOCUMENTS_AVAILABLE_AGAIN_CONTENT[args.reason ?? "UNLOCKED"]
  const subject = args.employeeName
    ? `${content.subject} – ${args.employeeName}`
    : content.subject

  const intro = content.intro

  const documentsListHtml =
    args.documents.length > 0
      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;">
                          <div style="font-size:14px;color:#082B2A;font-weight:700;">
                            ${escapeHtml(document.label)}
                          </div>
                          <div style="margin-top:6px;font-size:12px;">
                            <a href="${escapeHtml(document.url)}" style="color:${primary};word-break:break-all;">${escapeHtml(document.url)}</a>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  `
      : ""

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${content.subject}
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

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  ${documentsListHtml}

                  ${
                    args.extraNote
                      ? renderInfoBubbleHtml({
                          bgLight: "#fef3c7",
                          borderColor: "#fde68a",
                          titleColor: "#92400e",
                          title: "Poznámka",
                          bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      ${escapeHtml(args.extraNote)}
                    </p>
                    `,
                        })
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.flatMap((document) => [document.label, document.url, ""]),
    ...(args.extraNote ? ["Poznámka:", args.extraNote, ""] : []),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [args.to], subject, html, text })
}

const EMPLOYMENT_DOCUMENTS_NO_LONGER_NEEDED_HR_CONTENT: Record<
  EmploymentDocumentsNoLongerNeededReason,
  { subject: string; intro: string }
> = {
  LOCKED: {
    subject: "Nástupní dokumenty uzamčeny",
    intro:
      "níže uvedené nevyplněné nástupní dokumenty byly uzamčeny v aplikaci, zaměstnanec je již nemůže vyplnit.",
  },
  RECORD_CANCELLED: {
    subject: "Nástupní dokumenty již nejsou potřeba",
    intro:
      "níže uvedený plánovaný nástup byl přesunut mezi neuskutečněné, nevyplněné nástupní dokumenty tedy již nejsou potřeba a zaměstnanec je nemůže vyplnit.",
  },
  RECORD_DELETED: {
    subject: "Nástupní dokumenty již nejsou potřeba",
    intro:
      "níže uvedený plánovaný nástup byl smazán, nevyplněné nástupní dokumenty tedy již nejsou potřeba a zaměstnanec je nemůže vyplnit.",
  },
}

export async function sendEmploymentDocumentsLockedHrEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documents: Array<{ label: string }>
    reason?: EmploymentDocumentsNoLongerNeededReason
  }
): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) return

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const content =
    EMPLOYMENT_DOCUMENTS_NO_LONGER_NEEDED_HR_CONTENT[args.reason ?? "LOCKED"]
  const subject = args.employeeName
    ? `${content.subject} – ${args.employeeName}`
    : content.subject

  const intro = content.intro

  const documentsListHtml =
    args.documents.length > 0
      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  `
      : ""

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Informace pro HR
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(subject)}
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

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  ${documentsListHtml}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.map((document) => document.label),
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: recipients, subject, html, text })
}

const EMPLOYMENT_DOCUMENTS_AVAILABLE_AGAIN_HR_CONTENT: Record<
  EmploymentDocumentsAvailableAgainReason,
  { subject: string; intro: string }
> = {
  UNLOCKED: {
    subject: "Nástupní dokumenty odemčeny",
    intro:
      "níže uvedené nástupní dokumenty byly odemčeny v aplikaci, zaměstnanec je může znovu vyplnit.",
  },
  RECORD_RESTORED: {
    subject: "Nástupní dokumenty jsou znovu aktivní",
    intro:
      "níže uvedený plánovaný nástup byl obnoven a je znovu aktivní, zaměstnanec může nevyplněné nástupní dokumenty znovu vyplnit.",
  },
}

export async function sendEmploymentDocumentsUnlockedHrEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documents: Array<{ label: string; url: string }>
    reason?: EmploymentDocumentsAvailableAgainReason
    extraNote?: string | null
  }
): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) return

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const content =
    EMPLOYMENT_DOCUMENTS_AVAILABLE_AGAIN_HR_CONTENT[args.reason ?? "UNLOCKED"]
  const subject = args.employeeName
    ? `${content.subject} – ${args.employeeName}`
    : content.subject

  const intro = content.intro

  const documentsListHtml =
    args.documents.length > 0
      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;margin-bottom:16px;">
                    ${args.documents
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;">
                          <div style="font-size:14px;color:#082B2A;font-weight:700;">
                            ${escapeHtml(document.label)}
                          </div>
                          <div style="margin-top:6px;font-size:12px;">
                            <a href="${escapeHtml(document.url)}" style="color:${primary};word-break:break-all;">${escapeHtml(document.url)}</a>
                          </div>
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                  `
      : ""

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Informace pro HR
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(subject)}
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

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  ${documentsListHtml}

                  ${
                    args.extraNote
                      ? renderInfoBubbleHtml({
                          bgLight: "#fef3c7",
                          borderColor: "#fde68a",
                          titleColor: "#92400e",
                          title: "Poznámka",
                          bodyHtml: `
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      ${escapeHtml(args.extraNote)}
                    </p>
                    `,
                        })
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    ...args.documents.flatMap((document) => [document.label, document.url, ""]),
    ...(args.extraNote ? ["Poznámka:", args.extraNote, ""] : []),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: recipients, subject, html, text })
}

type OnboardingReminderRecord = {
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  plannedStart: Date
  link: string
}

function renderOnboardingReminderRecordsHtml(
  bgLight: string,
  primary: string,
  records: OnboardingReminderRecord[]
): string {
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
      style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
      ${records
        .map(
          (record, index) => `
      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
        <td style="padding:10px 16px;">
          <div style="font-size:14px;color:#082B2A;font-weight:700;">
            ${escapeHtml(record.employeeName)}
          </div>
          <div style="font-size:12px;color:#6b7280;">
            ${escapeHtml(record.employeePosition || "—")} – ${escapeHtml(record.employeeDepartment || "—")}
          </div>
          <div style="margin-top:2px;font-size:12px;color:#374151;">
            Plánovaný nástup: ${escapeHtml(fmtDate(record.plannedStart))}
          </div>
          <div style="margin-top:6px;font-size:12px;">
            <a href="${escapeHtml(record.link)}" style="color:${primary};word-break:break-all;">${escapeHtml(record.link)}</a>
          </div>
        </td>
      </tr>
      `
        )
        .join("")}
    </table>
  `
}

function renderOnboardingReminderRecordsText(
  records: OnboardingReminderRecord[]
): string[] {
  return records.flatMap((record) => [
    `${record.employeeName} (${record.employeePosition || "—"} – ${record.employeeDepartment || "—"})`,
    `Plánovaný nástup: ${fmtDate(record.plannedStart)}`,
    record.link,
    "",
  ])
}

function renderOnboardingReminderEmail(args: {
  headerLabel: string
  title: string
  intro: string
  records: OnboardingReminderRecord[]
}): { subject: string; html: string; text: string } {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.title

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    ${escapeHtml(args.headerLabel)}
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    ${escapeHtml(args.title)}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    ${escapeHtml(args.intro)}
                  </p>

                  ${renderOnboardingReminderRecordsHtml(bgLight, primary, args.records)}
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    args.intro,
    "",
    ...renderOnboardingReminderRecordsText(args.records),
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  return { subject, html, text }
}

export async function sendOnboardingStartNotConfirmedHrReminderEmail(args: {
  to: string[]
  records: OnboardingReminderRecord[]
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length || !args.records.length) return

  const { subject, html, text } = renderOnboardingReminderEmail({
    headerLabel: "Nástup · Upozornění pro HR",
    title:
      args.records.length === 1
        ? "Potvrzení nástupu – nastoupil(a) skutečně?"
        : `Potvrzení nástupu – zkontrolujte ${args.records.length} záznamů`,
    intro:
      "u níže uvedených plánovaných nástupů ještě nikdo v aplikaci nepotvrdil, jestli zaměstnanec skutečně nastoupil. Prosíme o kontrolu a potvrzení skutečného nástupu (nebo označení, že nenastoupil) u detailu každého záznamu.",
    records: args.records,
  })

  await sendMail({ to: recipients, subject, html, text })
}

export async function sendOnboardingReadyToLockHrReminderEmail(args: {
  to: string[]
  records: OnboardingReminderRecord[]
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length || !args.records.length) return

  const { subject, html, text } = renderOnboardingReminderEmail({
    headerLabel: "Nástup · Upozornění pro HR",
    title:
      args.records.length === 1
        ? "Nástupní dokumenty jsou 100 % hotové – označte jako dokončené"
        : `Nástupní dokumenty jsou 100 % hotové u ${args.records.length} záznamů`,
    intro:
      "u níže uvedených nástupů jsou nástupní dokumenty i žádost o pracovnělékařskou prohlídku kompletně vyplněné a odeslané. V okně Dokumenty je prosím označte jako hotové a uzamkněte.",
    records: args.records,
  })

  await sendMail({ to: recipients, subject, html, text })
}

export async function sendEmploymentDocumentPdfEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documentLabels: string[]
    attachments: Array<{
      filename: string
      content: Buffer
      contentType: string
    }>
  }
): Promise<{ subject: string; html: string }> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Vyplněné dokumenty k nástupu – ${args.employeeName}`
    : "Vyplněné dokumenty k nástupu"

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyplněné dokumenty${args.employeeName ? ` – ${escapeHtml(args.employeeName)}` : ""}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Personální oddělení zasílá vyplněné dokumenty níže uvedeného zaměstnance.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <table border="0" cellpadding="0" cellspacing="0" width="100%"
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                    ${args.documentLabels
                      .map(
                        (label, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>

                  <p style="margin:18px 0 0 0;font-size:12px;color:#6b7280;">
                    Dokumenty naleznete v příloze tohoto e-mailu ve formátu PDF.
                  </p>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    "Personální oddělení zasílá vyplněné dokumenty níže uvedeného zaměstnance:",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    "",
    ...args.documentLabels,
    "",
    "Dokumenty naleznete v příloze tohoto e-mailu ve formátu PDF.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: [args.to],
    subject,
    html,
    text,
    attachments: args.attachments,
  })

  return { subject, html }
}

type MedicalExamRequestVariant = "ULZ" | "OWN_DOCTOR"

function medicalExamInstructionSections(
  variant: MedicalExamRequestVariant,
  appointmentAt: string | null,
  selfArranged = false
): ExitChecklistRoleSection[] {
  if (variant === "ULZ") {
    const appointmentDate = appointmentAt ? new Date(appointmentAt) : null
    const appointmentLine =
      appointmentDate && !Number.isNaN(appointmentDate.getTime())
        ? `Termín: ${appointmentDate.toLocaleDateString("cs-CZ")} v ${appointmentDate.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })} hodin.`
        : selfArranged
          ? "Termín si prosím domluvte sám/sama přímo s ÚLZ."
          : "Termín Vám bude sdělen Personálním oddělením."

    return [
      {
        title: "Kde a kdy",
        description: `Prohlídku absolvujete v Ústavu leteckého zdravotnictví Praha, Generála Píky 229/1, Praha 6, který je naším poskytovatelem pracovnělékařských služeb. ${appointmentLine}`,
      },
      {
        title: "Při příchodu",
        description:
          "Dostavte se prosím do přijímací kanceláře v přízemí budovy, hned vpravo od hlavního vchodu – pracovnice přijímací kanceláře Vám sdělí číslo ordinace. Součástí prohlídky bude i vyšetření vzorku moči, nádoba na místě Vám bude poskytnuta.",
      },
      {
        title: "Co vzít s sebou",
        description:
          "Žádost o pracovnělékařskou prohlídku ve dvou vyhotoveních (v příloze tohoto e-mailu) a výpis ze zdravotní dokumentace od Vašeho ošetřujícího lékaře.",
      },
      {
        title: "Proplacení nákladů",
        description:
          "Náklady na výpis ze zdravotní dokumentace Vám proplatíme po předložení dokladu o úhradě a za podmínky vzniku pracovního poměru.",
      },
      {
        title: "Po prohlídce",
        description:
          "Dvě vyplněná paré lékařského posudku odevzdejte na Personálním oddělení při Vašem nástupu před podpisem pracovní smlouvy.",
      },
    ]
  }

  return [
    {
      title: "Kde a kdy",
      description:
        "Prohlídku absolvujete u Vašeho praktického lékaře dle Vámi sjednaného termínu.",
    },
    {
      title: "Co vzít s sebou",
      description:
        "Žádost o pracovnělékařskou prohlídku ve dvou vyhotoveních (v příloze tohoto e-mailu), kterou předložíte lékaři.",
    },
    {
      title: "Proplacení nákladů",
      description:
        "Náklady na lékařský posudek Vám proplatíme po předložení dokladu o úhradě a za podmínky vzniku pracovního poměru.",
    },
    {
      title: "Po prohlídce",
      description:
        "Dvě vyplněná paré lékařského posudku odevzdejte na Personálním oddělení při Vašem nástupu před podpisem pracovní smlouvy.",
    },
  ]
}

type EmploymentDocumentIdentityMismatch = {
  label: string
  expected: string
  actual: string
}

function renderEmploymentDocumentMismatchHtml(
  mismatches?: EmploymentDocumentIdentityMismatch[]
) {
  if (!mismatches?.length) return ""

  return `
    <div style="margin:0 0 18px 0;padding:12px 14px;border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;color:#9a3412;">
      <strong>⚠ Neshoda údajů s nástupem:</strong>
      <ul style="margin:8px 0 0 18px;padding:0;">
        ${mismatches
          .map(
            (m) =>
              `<li><strong>${escapeHtml(m.label)}:</strong> v nástupu „${escapeHtml(m.expected)}“, v dokumentu vyplněno „${escapeHtml(m.actual)}“</li>`
          )
          .join("")}
      </ul>
    </div>
  `
}

function renderEmploymentDocumentMismatchText(
  mismatches?: EmploymentDocumentIdentityMismatch[]
) {
  if (!mismatches?.length) return []

  return [
    "",
    "NESHODA ÚDAJŮ s nástupem:",
    ...mismatches.map(
      (m) => `- ${m.label}: v nástupu „${m.expected}“, vyplněno „${m.actual}“`
    ),
  ]
}

export async function sendEmploymentDocumentFilledHrEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documentTypeLabel: string
    filledAt: Date
    identityMismatches?: EmploymentDocumentIdentityMismatch[]
    pdfBuffer?: Buffer | null
    pdfFilename?: string | null
    onboardingLink?: string | null
  }
): Promise<{ subject: string; html: string }> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const hasMismatch = (args.identityMismatches?.length ?? 0) > 0
  const subject = `${hasMismatch ? "⚠ Neshoda údajů – " : ""}Vyplněný dokument – ${args.employeeName} – ${args.documentTypeLabel}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Vyplněný dokument
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyplněný dokument${args.employeeName ? ` – ${escapeHtml(args.employeeName)}` : ""}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    právě byl vyplněn dokument typu
                    <strong>${escapeHtml(args.documentTypeLabel)}</strong>.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  ${renderEmploymentDocumentMismatchHtml(args.identityMismatches)}

                  <p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;">
                    Datum a čas vyplnění: ${args.filledAt.toLocaleString("cs-CZ")}
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Dokument je k dispozici v interní aplikaci v detailu nástupu${
                      args.pdfBuffer
                        ? " a je přiložen k tomuto e-mailu ve formátu PDF."
                        : "."
                    }
                  </p>

                  ${
                    args.onboardingLink?.trim()
                      ? wrapWithBottomSpacing(
                          `
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
                          <a
                            href="${escapeHtml(args.onboardingLink.trim())}"
                            style="display:inline-block;padding:12px 28px;color:#ffffff;font-family:${EMAIL_FONT_FAMILY};font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px;"
                          >
                            Otevřít nástup
                          </a>
                        </td>
                      </tr>
                    </table>
                    `,
                          4
                        )
                      : ""
                  }
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    `právě byl vyplněn dokument typu ${args.documentTypeLabel}.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    ...renderEmploymentDocumentMismatchText(args.identityMismatches),
    "",
    `Datum a čas vyplnění: ${args.filledAt.toLocaleString("cs-CZ")}`,
    "",
    `Dokument je k dispozici v interní aplikaci v detailu nástupu${args.pdfBuffer ? " a je přiložen k tomuto e-mailu ve formátu PDF." : "."}`,
    "",
    args.onboardingLink?.trim() ? `Odkaz: ${args.onboardingLink.trim()}` : "",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({
    to: recipients,
    subject,
    html,
    text,
    attachments:
      args.pdfBuffer && args.pdfFilename
        ? [
            {
              filename: args.pdfFilename,
              content: args.pdfBuffer,
              contentType: "application/pdf",
            },
          ]
        : undefined,
  })

  return { subject, html }
}

export async function sendEmploymentDocumentFilledPayrollEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    filledAt: Date
    pdfBuffer: Buffer
    pdfFilename: string
  }
): Promise<{ subject: string; html: string }> {
  const recipients = normalizeEmailList(args.to)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Vyplněný dotazník pro vedení mzdové agendy – ${args.employeeName}`

  const html = `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml" lang="cs">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="color-scheme" content="light" />
      <meta name="supported-color-schemes" content="light" />
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
              <tr bgcolor="${primary}">
                <td bgcolor="${primary}" style="padding:25px 30px;background-color:${primary};border-radius:12px 12px 0 0;">
                  <div style="color:#ffffff;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;opacity:.9;">
                    Nástup&nbsp;·&nbsp;Mzdová agenda
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Vyplněný dotazník pro vedení mzdové agendy${
                      args.employeeName
                        ? ` – ${escapeHtml(args.employeeName)}`
                        : ""
                    }
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    Dobrý den,
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    právě byl vyplněn <strong>Dotazník pro vedení mzdové agendy</strong>.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

                  <p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;">
                    Datum a čas vyplnění: ${args.filledAt.toLocaleString("cs-CZ")}
                  </p>

                  <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                    Vyplněný dokument je přiložen k tomuto e-mailu ve formátu PDF.
                  </p>
                </td>
              </tr>

              ${renderHrContactCardsHtml(primary)}
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`

  const text = [
    "Dobrý den,",
    "",
    `právě byl vyplněn Dotazník pro vedení mzdové agendy.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    args.employeePosition ? `Pozice: ${args.employeePosition}` : "",
    args.employeeDepartment ? `Odbor: ${args.employeeDepartment}` : "",
    args.employeeUnitName ? `Oddělení: ${args.employeeUnitName}` : "",
    "",
    `Datum a čas vyplnění: ${args.filledAt.toLocaleString("cs-CZ")}`,
    "",
    "Vyplněný dokument je přiložen k tomuto e-mailu ve formátu PDF.",
    "",
    ...renderHrContactsText(),
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
        filename: args.pdfFilename,
        content: args.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  })

  return { subject, html }
}
