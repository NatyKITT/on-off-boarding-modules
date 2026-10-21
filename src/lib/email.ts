import type { MailJobStatus, MailJobType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Resend } from "resend"

import { buildCalendarLinksHtml, buildIcsCalendar } from "@/lib/calendar-link"
import { formatDayCountCs } from "@/lib/dates"
import { prisma } from "@/lib/db"
import { getEmployeeChangeDetailLabel } from "@/lib/employment-linking"
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
  <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">
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

const ROLE_SECTION_CARD_COLORS = [
  { bg: "#E5F5F2", border: "#99D8CF", title: "#00675F" },
  { bg: "#EFF6FF", border: "#BFDBFE", title: "#1D4ED8" },
  { bg: "#FEF3C7", border: "#FDE68A", title: "#92400E" },
]

function renderRoleSectionCardsHtml(
  intro: string,
  sections: ExitChecklistRoleSection[]
) {
  return wrapWithBottomSpacing(
    `
    <p style="margin:0 0 10px 0;font-family:${EMAIL_FONT_FAMILY};font-size:13px;font-weight:600;color:#082B2A;">
      ${escapeHtml(intro)}
    </p>
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      ${sections
        .map((section, index) => {
          const color =
            ROLE_SECTION_CARD_COLORS[index % ROLE_SECTION_CARD_COLORS.length]

          return `
          <tr>
            <td style="padding:0 0 8px 0;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="background-color:${color.bg};border:1px solid ${color.border};border-radius:8px;">
                <tr>
                  <td style="padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};">
                    <div style="font-size:13px;font-weight:700;color:${color.title};margin-bottom:4px;">
                      ${escapeHtml(section.title)}
                    </div>
                    <div style="font-size:13px;color:#374151;line-height:1.5;">
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
    `,
    16
  )
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
                  bgcolor="${bgLight}"
                  style="
                    padding: 18px 26px;
                    font-family: ${EMAIL_FONT_FAMILY};
                    font-size:12px;
                    color: #6b7280;
                    line-height: 1.5;
                    border-top: 1px solid #d9ece7;
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
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
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
                  bgcolor="${bgLight}"
                  style="
                    padding: 18px 26px;
                    font-family: ${EMAIL_FONT_FAMILY};
                    font-size: 12px;
                    color: #6b7280;
                    line-height: 1.5;
                    border-top: 1px solid #d9ece7;
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
  headerSubtitle?: string | null
}

export async function sendSignatureInviteEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  roleNote,
  headerSubtitle,
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
                          ${escapeHtml(headerSubtitle || "Pozvánka k podpisu")}
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
                    Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu:
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
                    roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                      ? renderRoleSectionCardsHtml(
                          "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                          EXIT_CHECKLIST_MANAGER_SECTIONS
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

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    Přihlaste se svým firemním účtem Google
                    (<strong>@praha6.cz</strong>).
                  </p>

                  <p class="intro-text" style="margin:0 0 24px 0;color:#374151;">
                    Po přihlášení budete přesměrováni na konkrétní výstupní list,
                    kde můžete doplnit potvrzení a elektronický podpis.
                  </p>

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

              <tr>
                <td
                  bgcolor="${bgLight}"
                  style="padding:18px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;line-height:1.5;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;"
                >
                  ${renderHrContactCardsHtml(primary)}
                </td>
              </tr>
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
    `Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    ...(roleNote ? [roleNote, ""] : []),
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
  behalfLabel?: string | null
  headerSubtitle?: string | null
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
  behalfLabel,
  headerSubtitle,
}: SendExitChecklistSignatureReminderEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const daysLabel =
    daysBeforeEnd <= 0 ? "dnes" : `za ${formatDayCountCs(daysBeforeEnd)}`
  const subject = `Připomínka podpisu výstupního listu (${daysLabel}) – ${employeeName}`

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
                    ${escapeHtml(headerSubtitle || `Připomínka podpisu (${daysLabel})`)}
                  </div>
                </td>
              </tr>

              <tr>
                <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
                  <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                    ${greeting}
                  </p>

                  <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                    stále čekáme na váš podpis výstupního listu zaměstnance
                    <strong>${escapeHtml(employeeName)}</strong>. Pracovní poměr
                    tohoto zaměstnance končí ${daysLabel === "dnes" ? "dnes" : daysLabel}
                    (${escapeHtml(fmtDate(employmentEndDate))}).
                  </p>

                  ${
                    behalfLabel
                      ? `
                  <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Podepisujete v zastoupení za <strong>${escapeHtml(behalfLabel)}</strong>.
                  </p>
                  `
                      : ""
                  }

                  ${
                    roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                      ? renderRoleSectionCardsHtml(
                          "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                          EXIT_CHECKLIST_MANAGER_SECTIONS
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

              <tr>
                <td
                  bgcolor="${bgLight}"
                  style="padding:18px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;line-height:1.5;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;"
                >
                  ${renderHrContactCardsHtml(primary)}
                </td>
              </tr>
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
    `Stále čekáme na váš podpis výstupního listu zaměstnance ${employeeName} (${employeePosition || "—"}, ${employeeDepartment || "—"}). Pracovní poměr tohoto zaměstnance končí ${daysLabel === "dnes" ? "dnes" : daysLabel}.`,
    "",
    ...(behalfLabel
      ? [`Podepisujete v zastoupení za ${behalfLabel}.`, ""]
      : []),
    roleNote ??
      `Ještě zbývá podepsat tento výstupní list – zkontrolujte, že má zaměstnanec vše fyzicky vyřízeno a odevzdáno, a podepište.`,
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
  removed = false,
}: SendSignatureSubstituteNoticeEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const greeting = "Dobrý den,"
  const subject = removed
    ? `Zastoupení při podpisu výstupního listu zrušeno – ${employeeName}`
    : `Zastoupení při podpisu výstupního listu – ${employeeName}`

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
                          ${removed ? "Zastoupení zrušeno" : "Oznámení o přiřazení zástupce k vaší agendě"}
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
                        ? `vaše zastoupení při podpisu výstupního listu bylo zrušeno. Jste evidováni jako pověřená osoba k podpisu výstupního listu:`
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
                    roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                      ? renderRoleSectionCardsHtml(
                          "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                          EXIT_CHECKLIST_MANAGER_SECTIONS
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

                  ${renderInfoBubbleHtml({
                    bgLight,
                    title: removed ? "Zrušený zástupce" : "O vašem zástupci",
                    introHtml: `
                    <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#374151;">
                      ${
                        removed
                          ? `Zastoupení osobou <strong>${escapeHtml(substituteName)}</strong> bylo zrušeno. Výstupní list nyní musíte podepsat sami.`
                          : `Pro podpis tohoto výstupního listu byla jako zástupce vybrána tato pověřená osoba:`
                      }
                    </p>
                    `,
                    rows: removed
                      ? undefined
                      : [
                          { label: "Zástupce", value: substituteName },
                          {
                            label: "Funkce",
                            value: substitutePosition || "—",
                          },
                          {
                            label: "Odbor",
                            value: substituteDepartment || "—",
                          },
                        ],
                  })}

                  ${renderInfoBubbleHtml({
                    bgLight: "#fef3c7",
                    borderColor: "#fde68a",
                    titleColor: "#92400e",
                    title: "Poznámka",
                    bodyHtml: `
                    ${
                      removed
                        ? ""
                        : `
                    <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#92400e;">
                      Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.
                    </p>
                    `
                    }
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">
                      V případě nejasností se neváhejte obrátit na Personální oddělení.
                    </p>
                    `,
                  })}

                  <p class="intro-text" style="margin:0 0 16px 0;color:#374151;">
                    Přihlaste se svým firemním účtem Google
                    (<strong>@praha6.cz</strong>).
                  </p>

                  <p class="intro-text" style="margin:0 0 24px 0;color:#374151;">
                    Po přihlášení budete přesměrováni na konkrétní výstupní list,
                    kde můžete doplnit potvrzení a elektronický podpis.
                  </p>

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

              <tr>
                <td
                  bgcolor="${bgLight}"
                  style="padding:18px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;line-height:1.5;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;"
                >
                  ${renderHrContactCardsHtml(primary)}
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
    removed
      ? "Vaše zastoupení při podpisu výstupního listu bylo zrušeno. Jste evidováni jako pověřená osoba k podpisu výstupního listu."
      : "Jste evidováni jako pověřená osoba k podpisu výstupního listu.",
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    ...(roleNote ? [roleNote, ""] : []),
    removed ? "Zrušený zástupce:" : "O vašem zástupci:",
    removed
      ? `Zastoupení osobou ${substituteName} bylo zrušeno. Výstupní list nyní musíte podepsat sami.`
      : `Pro podpis tohoto výstupního listu byla jako zástupce vybrána tato pověřená osoba:`,
    `Zástupce: ${substituteName}`,
    `Funkce: ${substitutePosition || "—"}`,
    `Odbor: ${substituteDepartment || "—"}`,
    "",
    "Poznámka:",
    ...(removed
      ? []
      : [
          "Přestože byl přiřazen zástupce, tento výstupní list můžete v případě potřeby stále podepsat i Vy osobně.",
        ]),
    "V případě nejasností se neváhejte obrátit na Personální oddělení.",
    "",
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
                          Odchod ze zaměstnání
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
                      <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td bgcolor="#d97706" style="border-radius:6px;background-color:#d97706;border:1px solid #d97706;">
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

                  <p style="margin:20px 0 10px 0;font-size:13px;color:#374151;">
                    V případě potřeby je Vám Personální oddělení plně k dispozici.
                  </p>

                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
  intro?: string | null
  pendingSigners?: string[] | null
}): Promise<void> {
  const recipients = normalizeEmailList(args.to)
  const pendingSigners = (args.pendingSigners ?? []).filter(Boolean)

  if (!recipients.length) {
    throw new Error("Chybí příjemce e-mailu.")
  }

  const primary = "#00847C"
  const bgLight = "#E5F5F2"

  const daysLabel = formatDayCountCs(args.daysBeforeEnd)

  const subject =
    args.subject?.trim() ||
    `Blíží se konec pracovního poměru – ${args.employeeName}`

  const intro =
    args.intro?.trim() ||
    `Pracovní poměr zaměstnance končí za ${daysLabel} a výstupní list zatím není kompletně podepsaný. Prosíme o zajištění podpisu všech povinných polí.`

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
                    Odchod zaměstnance&nbsp;·&nbsp;Výstupní list
                  </div>
                  <div style="color:#ffffff;font-size:20px;font-weight:bold;line-height:1.3;">
                    Blíží se konec pracovního poměru – ${escapeHtml(args.employeeName)}
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
                      ? wrapWithBottomSpacing(
                          `
                    <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#082B2A;">
                      Ještě nepodepsali (${pendingSigners.length}):
                    </p>
                    <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">
                      ${pendingSigners
                        .map((signer) => `<li>${escapeHtml(signer)}</li>`)
                        .join("")}
                    </ul>
                    `,
                          18
                        )
                      : ""
                  }

                  ${
                    checklistLink
                      ? `
                    ${wrapWithBottomSpacing(
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    pendingSigners.length > 0
      ? [
          "",
          `Ještě nepodepsali (${pendingSigners.length}):`,
          ...pendingSigners.map((signer) => `- ${signer}`),
        ].join("\n")
      : "",
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

  const intro = `Plánovaný konec pracovního poměru níže uvedeného zaměstnance už uplynul, ale v aplikaci zatím nikdo nepotvrdil, jestli k odchodu skutečně došlo. Prosíme o potvrzení v přehledu Odchodů – buď potvrďte skutečný odchod, nebo ho označte jako neuskutečněný.`

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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

  const intro = `Byl zaevidován nový předpokládaný ${labels.noun} (jde zatím jen o plánovaný záznam, ne o potvrzenou skutečnost), ale u záznamu zatím není vyplněný vedoucí odboru. Dokud nebude vedoucí doplněn, nedostane o tomto zaměstnanci/zaměstnankyni žádnou informaci. Prosíme o doplnění vedoucího odboru u záznamu.`

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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

  const intro = `V aplikaci byl zaevidován nový předpokládaný ${labels.noun} (jde zatím jen o plánovaný záznam, ne o potvrzenou skutečnost), u kterého jste uvedeni jako vedoucí odboru.`

  const loginNote = `Pro zobrazení podrobností se přihlaste svým firemním Google účtem (@praha6.cz nebo @kitt6.cz) – většina vedoucích má v aplikaci přístup v režimu pouze pro čtení. Pokud se po přihlášení do aplikace nedostanete, obraťte se na administrátora aplikace, případně na Personální oddělení (kontakty níže).`

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

                  <p style="margin:0 0 18px 0;font-size:13px;color:#374151;line-height:1.6;">
                    ${escapeHtml(loginNote)}
                  </p>

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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
      intro = `U níže uvedeného předpokládaného ${labels.noun}u jste byli odebráni jako vedoucí odboru. Nebudete již nadále dostávat informace k tomuto záznamu.`
      break
    case "RECORD_CANCELLED":
      subject = `Zrušen předpokládaný ${labels.noun} – ${args.employeeName}`
      intro = `Předpokládaný ${labels.noun} níže uvedeného zaměstnance, u kterého jste uvedeni jako vedoucí odboru, byl zrušen. K ${labels.noun}u nedojde.`
      break
    case "RECORD_DELETED":
      subject = `Smazán záznam předpokládaného ${labels.noun}u – ${args.employeeName}`
      intro = `Záznam níže uvedeného předpokládaného ${labels.noun}u, u kterého jste uvedeni jako vedoucí odboru, byl v aplikaci smazán.`
      break
    default:
      subject = `Změna u ${labels.noun}u, kde jste uvedeni jako vedoucí – ${args.employeeName}`
      intro = `U níže uvedeného předpokládaného ${labels.noun}u, u kterého jste uvedeni jako vedoucí odboru, došlo ke změně.`
  }

  const infoTable = renderInfoTable(bgLight, [
    { label: "Zaměstnanec", value: args.employeeName, strong: true },
    { label: "Osobní číslo", value: args.employeePersonalNumber },
    { label: "Pozice", value: args.employeePosition },
    { label: "Odbor", value: args.employeeDepartment },
    { label: "Oddělení", value: args.employeeUnitName },
    { label: labels.dateLabel, value: fmtDate(args.plannedDate) },
  ])

  const showLink = args.reason === "FIELDS_CHANGED"
  const recordLink = showLink ? args.recordLink?.trim() || null : null

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
                      ? wrapWithBottomSpacing(
                          `
                    <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:#082B2A;">
                      Co se změnilo:
                    </p>
                    <ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;line-height:1.6;">
                      ${changeSummary
                        .map((line) => `<li>${escapeHtml(line)}</li>`)
                        .join("")}
                    </ul>
                    `,
                          18
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
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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

  const introHtml = cancelled
    ? `ve výstupním listu níže uvedeného zaměstnance
               <strong>${employeeName}</strong> byla zrušena vaše odpovědnost
               za dokumenty v části <strong>„Za dokumenty odpovídá“</strong>
               (dříve z důvodu: <strong>${reasonText}</strong>).
               ${
                 managerLabel
                   ? `U vedoucího odboru <strong>${managerLabel}</strong> byl potvrzen
               jiný způsob předání agendy.`
                   : "Byl potvrzen jiný způsob předání agendy."
               }
               Žádné další kroky z vaší strany už nejsou potřeba.`
    : `ve výstupním listu níže uvedeného zaměstnance
               <strong>${employeeName}</strong> jste uvedeni v části
               <strong>„Za dokumenty odpovídá“</strong>.`

  const introText = cancelled
    ? `ve výstupním listu zaměstnance ${employeeName} byla zrušena vaše odpovědnost za dokumenty v části „Za dokumenty odpovídá“ (dříve z důvodu: ${reasonText}). ${managerLabel ? `U vedoucího odboru ${managerLabel} byl potvrzen jiný způsob předání agendy.` : "Byl potvrzen jiný způsob předání agendy."} Žádné další kroky z vaší strany už nejsou potřeba.`
    : `ve výstupním listu zaměstnance ${employeeName} jste uvedeni v části „Za dokumenty odpovídá“.`

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

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${introHtml}
              </p>

              ${
                cancelled
                  ? ""
                  : `<p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${
                  managerLabel
                    ? `U vedoucího odboru <strong>${managerLabel}</strong> bylo v rámci výstupního listu zvoleno, že`
                    : "V rámci výstupního listu bylo zvoleno, že"
                }
                agenda zatím zůstává na neobsazeném funkčním místě z důvodu:
                <strong>${reasonText}</strong>, a byli jste vybráni, že
                za dokumenty budete prozatím odpovídat.
              </p>`
              }

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
              </table>
              `,
                24
              )}

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

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    introText,
    "",
    cancelled
      ? ""
      : `${
          managerLabel
            ? `U vedoucího odboru ${managerLabel} bylo v rámci výstupního listu zvoleno, že`
            : "V rámci výstupního listu bylo zvoleno, že"
        } agenda zatím zůstává na neobsazeném funkčním místě z důvodu: ${reasonText}, a byli jste vybráni, že za dokumenty budete prozatím odpovídat.`,
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
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
  targetPosition: string
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
  targetPosition,
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

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                Osoba <strong>${escapeHtml(employeeName)}</strong>
                (${escapeHtml(employeePosition || "—")}, ${escapeHtml(employeeDepartment || "—")})
                ukončuje pracovní poměr${employmentEndDate ? ` dne ${escapeHtml(employmentEndDate)}` : ""}.
                ${
                  cancelled
                    ? managerLabel
                      ? `U vedoucího odboru <strong>${escapeHtml(managerLabel)}</strong> bylo
                zrušeno dříve zvolené předání agendy na jiné funkční místo v
                rámci KITT6 a byl potvrzen jiný způsob předání.`
                      : `Dříve zvolené předání agendy na jiné funkční místo
                v rámci KITT6 bylo zrušeno a byl potvrzen jiný způsob
                předání.`
                    : managerLabel
                      ? `U vedoucího odboru <strong>${escapeHtml(managerLabel)}</strong>
                bylo v rámci výstupního listu zvoleno, že agenda bude předána
                na jiné funkční místo v rámci KITT6.`
                      : `V rámci výstupního listu bylo zvoleno, že
                agenda bude předána na jiné funkční místo v rámci KITT6.`
                }
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;">
                <tr>
                  <td style="background-color:${bgLight};border:1px solid #d9ece7;border-radius:8px;padding:12px 16px;font-family:${EMAIL_FONT_FAMILY};font-size:13px;line-height:1.5;color:#082B2A;">
                    Navržené cílové funkční místo:
                    <strong>${escapeHtml(targetPosition)}</strong>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                Prosíme o zajištění předání agendy na uvedené místo.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    `Osoba ${employeeName} (${employeePosition || "—"}, ${employeeDepartment || "—"}) ukončuje pracovní poměr${employmentEndDate ? ` dne ${employmentEndDate}` : ""}. ${
      managerName
        ? `U vedoucího odboru ${managerName}${
            managerPosition || managerDepartment
              ? ` (${[managerPosition, managerDepartment].filter(Boolean).join(" - ")})`
              : ""
          } bylo v rámci výstupního listu zvoleno, že agenda bude předána na jiné funkční místo v rámci KITT6.`
        : "V rámci výstupního listu bylo zvoleno, že agenda bude předána na jiné funkční místo v rámci KITT6."
    }`,
    "",
    `Navržené cílové funkční místo: ${targetPosition}`,
    "",
    "Prosíme o zajištění předání agendy na uvedené místo.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

export async function sendExitChecklistSignatoryRemovedEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Podpis výstupního listu již není potřeba – ${employeeName}`

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
                Podpis již není potřeba
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                u výstupního listu zaměstnance
                <strong>${employeeName}</strong> byl zrušen střet zájmů, takže
                už <strong>není potřeba</strong>, abyste tento výstupní list
                podepisovali. Odkaz k podpisu, který jste dříve obdrželi,
                už není aktivní.
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
              </table>
              `,
                24
              )}

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Zpráva byla odeslána prostřednictvím aplikace On-Off-Boarding ÚMČ Praha&nbsp;6.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    `u výstupního listu zaměstnance ${employeeName} byl zrušen střet zájmů, takže už není potřeba, abyste tento výstupní list podepisovali. Odkaz k podpisu, který jste dříve obdrželi, už není aktivní.`,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    "Prosíme, neodpovídejte na tento e-mail.",
    "",
    ...renderHrContactsText(),
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [to], subject, html, text })
}

type UnresolvedExitChecklistItem = {
  label: string
  organization: string
  note: string | null
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
  items: UnresolvedExitChecklistItem[]
  checklistUrl?: string | null
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Nevyrovnané položky výstupního listu – ${employeeName}`

  const itemsHtml = items
    .map(
      (item, index) => `
                <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                  <td style="padding:10px 16px;font-size:13px;color:#082B2A;vertical-align:top;">
                    <div style="font-weight:600;">${escapeHtml(item.label)}</div>
                    <div style="font-size:11px;color:#6b7280;">${escapeHtml(item.organization)}</div>
                    ${
                      item.note
                        ? `<div style="margin-top:4px;font-size:13px;color:#374151;">${escapeHtml(item.note)}</div>`
                        : ""
                    }
                  </td>
                </tr>`
    )
    .join("")

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

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                u výstupního listu zaměstnance
                <strong>${escapeHtml(employeeName)}</strong>
                (${escapeHtml(employeePosition || "—")}, ${escapeHtml(employeeDepartment || "—")},
                datum odchodu ${escapeHtml(employmentEndDate || "—")}) jsou
                označeny jako <strong>nevyrovnané</strong> tyto položky:
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0" width="100%"
                style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                ${itemsHtml}
              </table>
              `,
                24
              )}

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

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    `U výstupního listu zaměstnance ${employeeName} (${employeePosition || "—"}, ${employeeDepartment || "—"}, datum odchodu ${employmentEndDate || "—"}) jsou označeny jako nevyrovnané tyto položky:`,
    "",
    ...items.map(
      (item) =>
        `- ${item.label} (${item.organization})${item.note ? `: ${item.note}` : ""}`
    ),
    "",
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
  behalfLabel,
  stillHasOtherAccess,
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  behalfLabel?: string | null
  stillHasOtherAccess?: boolean
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = behalfLabel
    ? `Zastoupení při podpisu výstupního listu zrušeno – ${employeeName}`
    : `Podpis výstupního listu již není potřeba – ${employeeName}`

  const introParagraph = behalfLabel
    ? `vaše zastoupení při podpisu výstupního listu za <strong>${escapeHtml(behalfLabel)}</strong> bylo zrušeno. Byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:`
    : `byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:`

  const linkParagraph = stillHasOtherAccess
    ? "Nyní tedy nemáte v této roli možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní, protože jste v seznamu uvedeni i v jiné roli."
    : "Nyní tedy nemáte možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, již není aktivní."

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
                ${behalfLabel ? "Zastoupení zrušeno" : "Odebráno ze seznamu k podpisu"}
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

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${linkParagraph}
              </p>

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Pokud je něco v nepořádku, kontaktujte Personální oddělení.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const introParagraphText = behalfLabel
    ? `Vaše zastoupení při podpisu výstupního listu za ${behalfLabel} bylo zrušeno. Byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:`
    : `Byli jste odebráni ze seznamu osob k podpisu tohoto výstupního listu:`
  const linkParagraphText = stillHasOtherAccess
    ? "Nyní tedy nemáte v této roli možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, zůstává aktivní, protože jste v seznamu uvedeni i v jiné roli."
    : "Nyní tedy nemáte možnost tento výstupní list podepsat. Odkaz k podpisu, který jste dříve obdrželi, již není aktivní."

  const text = [
    greeting,
    "",
    introParagraphText,
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    linkParagraphText,
    "",
    "Pokud je něco v nepořádku, kontaktujte Personální oddělení.",
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
}: {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | null
  signUrl: string
}): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Znovu zařazeni k podpisu výstupního listu – ${employeeName}`

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
                Znovu zařazeni k podpisu
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                byli jste znovu zařazeni do seznamu osob k podpisu
                výstupního listu zaměstnance
                <strong>${escapeHtml(employeeName)}</strong>
                (${escapeHtml(employeePosition || "—")}, ${escapeHtml(employeeDepartment || "—")},
                datum odchodu ${escapeHtml(employmentEndDate || "—")}) a
                můžete ho opět podepsat.
              </p>

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

          <tr>
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    `Byli jste znovu zařazeni do seznamu osob k podpisu výstupního listu zaměstnance ${employeeName} (${employeePosition || "—"}, ${employeeDepartment || "—"}, datum odchodu ${employmentEndDate || "—"}) a můžete ho opět podepsat.`,
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
}

export async function sendExitChecklistCompletedToEmployeeEmail({
  to,
  employeeName,
}: SendExitChecklistCompletedToEmployeeEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = "Váš výstupní list je podepsán"

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
                    Dobrý den${employeeName ? ` ${escapeHtml(employeeName)}` : ""},
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    Váš výstupní list byl kompletně vyplněn a podepsán všemi
                    zúčastněnými stranami. Pro vyzvednutí zápočtového listu se
                    prosím dostavte na Personální oddělení.
                  </p>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    "Váš výstupní list byl kompletně vyplněn a podepsán všemi zúčastněnými stranami. Pro vyzvednutí zápočtového listu se prosím dostavte na Personální oddělení.",
    "",
    ...renderHrContactsText(),
  ].join("\n")

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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
  behalfOfPosition,
  behalfOfDepartment,
  roleNote,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  signUrl,
  obligations,
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
                Výstupní list – zastoupení
              </div>
              <div style="color:#ffffff;font-size:22px;font-weight:bold;line-height:1.2;">
                Oznámení o přiřazení jako zástupce
              </div>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:26px 30px;background-color:#ffffff;font-family:${EMAIL_FONT_FAMILY};">
              <p style="margin:0 0 16px 0;font-size:14px;color:#082B2A;">
                ${greeting}
              </p>

              ${renderInfoBubbleHtml({
                bgLight,
                title: "O vaší roli zástupce",
                introHtml: `
                <p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#374151;">
                  byli jste vybráni jako zástupce za
                  <strong>${escapeHtml(behalfFullLabel)}</strong>
                  k podpisu výstupního listu zaměstnance
                  <strong>${escapeHtml(employeeName)}</strong>. Podpis prosím
                  proveďte výhradně v zastoupení za
                  <strong>${escapeHtml(behalfFullLabel)}</strong> – nejedná se
                  o podpis vlastním jménem.
                </p>
                `,
                rows: [
                  { label: "Zastupujete za", value: behalfFullLabel },
                  ...(behalfOfPosition || behalfOfDepartment
                    ? [
                        {
                          label: "Funkce zastupované osoby",
                          value: [behalfOfPosition, behalfOfDepartment]
                            .filter(Boolean)
                            .join(" – "),
                        },
                      ]
                    : []),
                ],
                bodyHtml:
                  obligationsList.length > 0
                    ? `
                <p style="margin:8px 0 4px 0;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">
                  Agenda, kterou máte ověřit a podepsat
                </p>
                <div style="font-size:13px;color:#374151;line-height:1.6;">
                  ${obligationsList.map((item) => `• ${escapeHtml(item)}`).join("<br/>")}
                </div>
                `
                    : "",
              })}

              ${renderExitChecklistInfoTable({
                primary,
                bgLight,
                employeeName,
                employeePosition,
                employeeDepartment,
                employmentEndDate,
              })}

              ${
                roleNote === EXIT_CHECKLIST_MANAGER_ROLE_NOTE
                  ? renderRoleSectionCardsHtml(
                      "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
                      EXIT_CHECKLIST_MANAGER_SECTIONS
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

              <p style="margin:0 0 16px 0;font-size:14px;color:#374151;line-height:1.6;">
                Pro podpis je potřeba se přihlásit firemním Google účtem
                <strong>@praha6.cz</strong>.
                Po přihlášení budete přesměrováni přímo na výstupní list.
              </p>

              ${wrapWithBottomSpacing(
                `
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td bgcolor="${primary}" style="border-radius:6px;background-color:${primary};border:1px solid ${primary};">
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
            <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
              ${renderHrContactCardsHtml(primary)}
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
    "O vaší roli zástupce:",
    `byli jste vybráni jako zástupce za ${behalfFullLabel} k podpisu výstupního listu zaměstnance ${employeeName}. Podpis prosím proveďte výhradně v zastoupení za ${behalfFullLabel} – nejedná se o podpis vlastním jménem.`,
    `Zastupujete za: ${behalfFullLabel}`,
    ...(behalfOfPosition || behalfOfDepartment
      ? [
          `Funkce zastupované osoby: ${[behalfOfPosition, behalfOfDepartment].filter(Boolean).join(" – ")}`,
        ]
      : []),
    ...(obligationsList.length > 0
      ? [
          "",
          "Agenda, kterou máte ověřit a podepsat:",
          ...obligationsList.map((item) => `- ${item}`),
        ]
      : []),
    "",
    `Zaměstnanec: ${employeeName}`,
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${employmentEndDate || "—"}`,
    "",
    ...(roleNote ? [roleNote, ""] : []),
    "Pro podpis je potřeba se přihlásit firemním Google účtem @praha6.cz",
    "",
    `Odkaz: ${signUrl}`,
    "",
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
    "Žádost o provedení pracovnělékařské prohlídky a informace k termínu vstupní prohlídky Vám zašleme samostatným e-mailem po vyplnění osobního dotazníku.",
}

const DOCUMENT_LINK_NOTES: Record<string, string> = {
  AFFIDAVIT: "Důležitý podklad pro řádný zápočet praxe.",
  PERSONAL_QUESTIONNAIRE: "Pro účely zpracování personální agendy.",
  PAYROLL_INFO: "Zákonné údaje pro řádné vedení mzdové agendy.",
}

const HR_CONTACTS = [
  {
    name: "Mgr. Michaela Aronová",
    role: "vedoucí personálního oddělení",
    org: "Kancelář tajemníka, Personální oddělení",
    email: "maronova@praha6.cz",
    phone: "+420 220189350",
  },
  {
    name: "Terezie Machková",
    role: "referent personální agendy",
    org: "Kancelář tajemníka, Personální oddělení",
    email: "tmachkova@praha6.cz",
    phone: "+420 220189956",
  },
]

function renderHrContactCardsHtml(primary: string): string {
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
      <tr>
        ${HR_CONTACTS.map(
          (contact, index) => `
        <td width="50%" valign="top" style="${index === 0 ? "padding-right:6px;" : "padding-left:6px;"}">
          <div style="border:1px solid #d9ece7;border-radius:8px;padding:10px 12px;font-size:12px;color:#374151;line-height:1.5;">
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
    medicalExam?: {
      variant: MedicalExamRequestVariant
      appointmentAt?: string | null
      selfArranged?: boolean
      attachment: { filename: string; content: Buffer }
    }
  }
): Promise<{ subject: string; html: string }> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Dokumenty k nástupu${args.medicalExam ? " a žádost o pracovnělékařskou prohlídku" : ""} – ${args.employeeName}`
    : `Dokumenty k nástupu${args.medicalExam ? " a žádost o pracovnělékařskou prohlídku" : ""}`
  const includesPersonalQuestionnaire = args.documents.some(
    (document) => document.type === "PERSONAL_QUESTIONNAIRE"
  )
  const medicalExamSections = args.medicalExam
    ? medicalExamInstructionSections(
        args.medicalExam.variant,
        args.medicalExam.appointmentAt ?? null,
        Boolean(args.medicalExam.selfArranged)
      )
    : null

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
                        ${
                          args.medicalExam
                            ? ""
                            : `
                        <p style="margin:8px 0 0 0;">
                          ${escapeHtml(NEXT_STEPS_INFO_TEXT.appointment)}
                        </p>
                        `
                        }
                      </td>
                    </tr>
                  </table>
                  `
                      : ""
                  }

                  ${
                    medicalExamSections
                      ? `
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;">
                    <tr>
                      <td style="padding:0 0 12px 0;border-top:1px solid #d9ece7;padding-top:20px;">
                        <div style="font-size:16px;font-weight:bold;color:#082B2A;">
                          Žádost o pracovnělékařskou prohlídku
                        </div>
                        <p style="margin:6px 0 0 0;font-size:13px;color:#374151;line-height:1.6;">
                          Zároveň Vám zasíláme žádost o provedení pracovnělékařské prohlídky a posouzení zdravotní způsobilosti k práci (v příloze tohoto e-mailu) a instrukce ke vstupní prohlídce.
                        </p>
                      </td>
                    </tr>
                  </table>
                  ${renderRoleSectionCardsHtml(
                    "Instrukce ke vstupní prohlídce:",
                    medicalExamSections
                  )}
                  `
                      : ""
                  }

                  <p style="margin:20px 0 10px 0;font-size:13px;color:#374151;">
                    V případě potřeby je Vám Personální oddělení plně k dispozici.
                  </p>

                  ${renderHrContactCardsHtml(primary)}
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    `platnost odkazu k vyplnění níže uvedených dokumentů brzy vyprší (${expiresAtLabel}). Prosíme o jejich vyplnění co nejdříve, po vypršení platnosti bude potřeba požádat Personální oddělení o nový odkaz.`,
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
                    Platnost odkazu k vyplnění níže uvedených dokumentů vypršela a dokumenty stále nejsou vyplněné. Pro nové odeslání je potřeba dokument nejdříve obnovit tlačítkem „Nový odkaz“.
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
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                      </tr>
                    `
                      )
                      .join("")}
                  </table>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    `Platnost odkazu k vyplnění níže uvedených dokumentů vypršela a dokumenty stále nejsou vyplněné. Pro nové odeslání je potřeba dokument nejdříve obnovit tlačítkem „Nový odkaz“.`,
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

export async function sendEmploymentDocumentNotSentHrReminderEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string[]
    documents: Array<{ label: string }>
    plannedStart: Date
    medicalExamNotSent?: boolean
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
                    Zaměstnanci (plánovaný nástup: ${escapeHtml(plannedStartLabel)}) ještě nebylo odesláno: <strong>${escapeHtml(missingLabel)}</strong>. Prosíme o odeslání co nejdříve.
                  </p>

                  ${renderEmploymentDocumentInfoTable({
                    bgLight,
                    employeeName: args.employeeName,
                    employeePersonalNumber: args.employeePersonalNumber,
                    employeePosition: args.employeePosition,
                    employeeDepartment: args.employeeDepartment,
                    employeeUnitName: args.employeeUnitName,
                  })}

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
                    style="border:1px solid #d9ece7;border-radius:8px;overflow:hidden;border-collapse:separate;">
                    <tr bgcolor="${bgLight}" style="background-color:${bgLight};">
                      <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                        Žádost o pracovnělékařskou prohlídku
                      </td>
                    </tr>
                  </table>
                  `
                      : ""
                  }
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    `Zaměstnanci (plánovaný nástup: ${plannedStartLabel}) ještě nebylo odesláno: ${missingLabel}. Prosíme o odeslání co nejdříve.`,
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
      "U níže uvedených plánovaných nástupů ještě nikdo v appce nepotvrdil, jestli zaměstnanec skutečně nastoupil. Prosíme o kontrolu a potvrzení skutečného nástupu (nebo označení, že nenastoupil) u detailu každého záznamu.",
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
      "U níže uvedených nástupů jsou nástupní dokumenty i žádost o pracovnělékařskou prohlídku kompletně vyplněné a odeslané. V okně Dokumenty je prosím označte jako hotové a uzamkněte.",
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
                    Právě byl vyplněn dokument typu
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

                  <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                    Dokument je k dispozici v interní aplikaci v detailu nástupu${
                      args.pdfBuffer
                        ? " a je přiložen k tomuto e-mailu ve formátu PDF."
                        : "."
                    }
                  </p>
                </td>
              </tr>

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    `Právě byl vyplněn dokument typu ${args.documentTypeLabel}.`,
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
                    Právě byl vyplněn <strong>Dotazník pro vedení mzdové agendy</strong>.
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

              <tr>
                <td bgcolor="${bgLight}" style="padding:16px 30px;font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;border-top:1px solid #d9ece7;border-radius:0 0 12px 12px;">
                  ${renderHrContactCardsHtml(primary)}
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
    `Právě byl vyplněn Dotazník pro vedení mzdové agendy.`,
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
