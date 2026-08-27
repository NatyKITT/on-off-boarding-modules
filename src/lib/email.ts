import type { MailJobStatus, MailJobType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Resend } from "resend"

import { buildCalendarLinksHtml, buildIcsCalendar } from "@/lib/calendar-link"
import { formatDayCountCs } from "@/lib/dates"
import { prisma } from "@/lib/db"
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

const CZECH_TITLE_WORDS =
  /^(ing|mgr|bc|mudr|judr|phdr|rndr|doc|prof|mba|dis|csc|ph\.d)\.?$/i

function guessCzechSurnameIsFemale(displayName?: string | null): boolean {
  const parts = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .filter((part) => part && !CZECH_TITLE_WORDS.test(part.replace(/\.$/, "")))

  const surname = parts[parts.length - 1] ?? ""

  return /á$/i.test(surname)
}

export function genderedPastVerb(
  displayName: string | null | undefined,
  maleForm: string,
  femaleForm: string
): string {
  if (!displayName?.trim()) return `${maleForm}(a)`
  return guessCzechSurnameIsFemale(displayName) ? femaleForm : maleForm
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
    raw?: boolean
  }>
}) {
  const employmentEndDateIso = toIsoDateOnly(args.employmentEndDate)

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
    ...(employmentEndDateIso
      ? [
          {
            label: "Kalendář",
            value: buildCalendarLinksHtml({
              title: `Konec pracovního poměru – ${args.employeeName}`,
              description: [args.employeePosition, args.employeeDepartment]
                .filter(Boolean)
                .join(", "),
              date: employmentEndDateIso,
            }),
            raw: true,
          },
        ]
      : []),
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
            <th align="left" style="padding: 13px; width: 120px; font-weight: 600; text-transform: uppercase; font-size:11px; white-space: nowrap; color: #ffffff;">Kalendář</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const calendarEvent = buildEmailRecordCalendarEvent(r)

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

function employeeChangeTypeLabel(type: EmployeeChangeEmailRecord["type"]) {
  if (type === "NAME") return "Změna jména"
  if (type === "POSITION") return "Změna pozice"
  if (type === "MATERNITY_LEAVE") return "Mateřská dovolená"
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
    const oldFull = formatEmployeeChangeOldName(record)
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

function labelGenitive(label: string): string {
  if (label === "Jméno") return "jména"
  if (label === "Pozice") return "pozice"
  return label.toLowerCase()
}

function renderChangeValueCell(
  labelPrefix: string,
  fieldLabel: string,
  value: string,
  variant: "old" | "new"
) {
  const bg = variant === "old" ? "#e9ebee" : "#E5F5F2"
  const border = variant === "old" ? "#c6cbd2" : "#00847C"
  const color = variant === "old" ? "#4b5563" : "#00847C"
  const fontWeight = variant === "old" ? 500 : 700
  const labelColor = variant === "old" ? "#6b7280" : "#00847C"

  return `
    <td width="50%" height="1" valign="top" style="width:50%;height:1px;font-family:${EMAIL_FONT_FAMILY};">
      <div style="box-sizing:border-box;height:100%;background-color:${bg};border:1px solid ${border};border-radius:8px;padding:8px 10px;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
        <div style="margin-bottom:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:${labelColor};-webkit-text-size-adjust:100%;text-size-adjust:100%;">
          ${escapeHtml(labelPrefix)} - ${escapeHtml(fieldLabel)}
        </div>
        <div style="font-size:12px;font-weight:${fontWeight};color:${color};word-break:break-word;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
          ${escapeHtml(value)}
        </div>
      </div>
    </td>
  `
}

function renderEmployeeChangeBubbles(
  record: EmployeeChangeEmailRecord
): string {
  if (record.type === "MATERNITY_LEAVE") {
    const calendarEvent = buildEmployeeChangeCalendarEvent(record)

    return `
      <div style="display:inline-block;background-color:#E5F5F2;border:1px solid #00847C;border-radius:8px;padding:8px 10px;font-family:${EMAIL_FONT_FAMILY};">
        <div style="margin-bottom:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:#00847C;">
          Změna
        </div>
        <div style="font-size:12px;font-weight:700;color:#00847C;">
          Odchod na mateřskou dovolenou
        </div>
        ${
          calendarEvent
            ? `<div style="margin-top:6px;">${buildCalendarLinksHtml(calendarEvent)}</div>`
            : ""
        }
      </div>
    `
  }

  const groups = buildEmployeeChangeGroups(record)

  if (!groups.length) {
    return `<div style="font-family:${EMAIL_FONT_FAMILY};font-size:12px;color:#6b7280;">Bez detailu změny</div>`
  }

  return groups
    .map((group) => {
      const genitive = labelGenitive(group.label)

      return `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;margin-bottom:10px;font-family:${EMAIL_FONT_FAMILY};">
          <tr>
            ${renderChangeValueCell("Původní hodnota", genitive, group.oldValue, "old")}
            <td width="12" style="width:12px;min-width:12px;font-size:1px;line-height:1px;">&nbsp;</td>
            ${renderChangeValueCell("Nová hodnota", genitive, group.newValue, "new")}
          </tr>
        </table>
      `
    })
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

  return wrapWithBottomSpacing(
    `
    <div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
    <table border="0" cellpadding="0" cellspacing="0"
      style="border-collapse:collapse;font-family:${EMAIL_FONT_FAMILY};font-size:13px;">
      <thead>
        <tr bgcolor="#00847C" style="background-color:#00847C;color:#ffffff;">
          <th align="left" style="padding:13px;width:150px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:normal;">Zaměstnanec</th>
          ${
            showPersonalNumberColumn
              ? `<th align="left" style="padding:13px;width:55px;font-size:11px;text-transform:uppercase;color:#ffffff;">Osobní číslo</th>`
              : ""
          }
          <th align="left" style="padding:13px;width:60px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Číslo funkce</th>
          <th align="left" style="padding:13px;width:65px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:normal;">Typ změny</th>
          <th align="left" style="padding:13px;width:360px;font-size:11px;text-transform:uppercase;color:#ffffff;">Změna</th>
          <th align="left" style="padding:13px;width:65px;font-size:11px;text-transform:uppercase;color:#ffffff;white-space:nowrap;">Účinnost</th>
        </tr>
      </thead>

      <tbody>
        ${records
          .map((record, index) => {
            const assignmentSummary = buildEmployeeChangePositionSummary(
              record,
              true
            )
            const positionNum = record.newPositionNum ?? record.oldPositionNum

            return `
              <tr bgcolor="${index % 2 === 0 ? "#ffffff" : "#f9fafb"}" style="background-color:${index % 2 === 0 ? "#ffffff" : "#f9fafb"};">
                <td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-weight:600;color:#111827;">
                  ${escapeHtml(formatEmployeeChangeName(record))}
                  ${
                    !showPersonalNumberColumn && record.personalNumber
                      ? `<div style="margin-top:2px;font-size:11px;font-weight:400;color:#6b7280;">#${escapeHtml(record.personalNumber)}</div>`
                      : ""
                  }
                  ${
                    assignmentSummary && assignmentSummary !== "—"
                      ? `<div style="margin-top:3px;font-size:11px;font-weight:400;color:#6b7280;">${escapeHtml(assignmentSummary)}</div>`
                      : ""
                  }
                </td>
                ${
                  showPersonalNumberColumn
                    ? `<td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">${escapeHtml(record.personalNumber || "—")}</td>`
                    : ""
                }
                <td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
                  ${escapeHtml(positionNum || "—")}
                </td>
                <td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#111827;">
                  ${escapeHtml(employeeChangeTypeLabel(record.type))}
                </td>
                <td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                  ${renderEmployeeChangeBubbles(record)}
                </td>
                <td style="padding:13px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap;color:#111827;">
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
          showPersonalNumberColumn: changeAudience === "ONBOARDING_GROUP",
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
                showPersonalNumberColumn: changeAudience === "ONBOARDING_GROUP",
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
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: ${bgLight}; width: 100% !important; font-family: ${EMAIL_FONT_FAMILY}; -webkit-text-size-adjust: 100%; text-size-adjust: 100%;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${bgLight}">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table
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
}

export async function sendSignatureInviteEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
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
                          Pozvánka k podpisu
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
                    Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu zaměstnance/zaměstnankyně:
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
    "Personální oddělení vám zaslalo pozvánku k elektronickému podpisu výstupního listu.",
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

type SendEmployeeExitChecklistInviteEmailParams = {
  to: string
  employeeName: string
  employeePosition?: string | null
  employeeDepartment?: string | null
  employmentEndDate?: string | Date | null
  signUrl: string
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
                    Váš odchod byl zaevidován jako plánovaný. Než pracovní poměr
                    skončí, je potřeba předat agendu, vrátit svěřený majetek
                    a elektronicky podepsat výstupní list.
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
                    (<strong>@praha6.cz</strong>) – stejným, na který vám tento
                    e-mail přišel.
                  </p>

                  <p class="intro-text" style="margin:0 0 24px 0;color:#374151;">
                    Po přihlášení budete přesměrován(a) na výstupní list, kde
                    potvrdíte předání agendy a majetku a připojíte svůj podpis.
                    Jakmile podepíší všechny zúčastněné strany, přijde vám
                    e-mailem potvrzení a budete se moct dostavit na Personální
                    oddělení pro zápočtový list.
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
    "Váš odchod byl zaevidován jako plánovaný. Než pracovní poměr skončí, je potřeba předat agendu, vrátit svěřený majetek a elektronicky podepsat výstupní list.",
    "",
    `Pozice: ${employeePosition || "—"}`,
    `Odbor: ${employeeDepartment || "—"}`,
    `Datum odchodu: ${fmtDate(employmentEndDate)}`,
    "",
    "Přihlaste se svým firemním účtem Google (@praha6.cz) – stejným, na který vám tento e-mail přišel.",
    "Po přihlášení budete přesměrován(a) na výstupní list k potvrzení a podpisu.",
    "Jakmile podepíší všechny zúčastněné strany, přijde vám e-mailem potvrzení a budete se moct dostavit na Personální oddělení pro zápočtový list.",
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
      label: "Hodnotil(a)",
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

  const probationEndDateIso = toIsoDateOnly(args.probationEndDate)

  if (probationEndDateIso) {
    rows.push({
      label: "Kalendář",
      value: buildCalendarLinksHtml({
        title: `Konec zkušební doby – ${args.employeeName ?? ""}`.trim(),
        description: [args.employeePosition, args.employeeDepartment]
          .filter(Boolean)
          .join(", "),
        date: probationEndDateIso,
      }),
      raw: true,
    })
  }

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

  const employmentEndDateIso = toIsoDateOnly(args.employmentEndDate)

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
    ...(employmentEndDateIso
      ? [
          {
            label: "Kalendář",
            value: buildCalendarLinksHtml({
              title: `Konec pracovního poměru – ${args.employeeName}`,
              description: [args.employeePosition, args.employeeDepartment]
                .filter(Boolean)
                .join(", "),
              date: employmentEndDateIso,
            }),
            raw: true,
          },
        ]
      : []),
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

export async function sendProbationEvaluationTajemnikReviewRequestEmail(
  args: SendProbationEvaluationTajemnikReviewRequestEmailParams
): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = `Vyhodnocení zkušební doby – vyjádření tajemníka – ${args.employeeName}`
  const supervisorVerb = genderedPastVerb(
    args.supervisorName || args.evaluatorName,
    "vyplnil",
    "vyplnila"
  )
  const greeting = args.tajemnikName
    ? `Vážený pane tajemníku, ${args.tajemnikName},`
    : "Vážený pane tajemníku,"

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
                    vedoucí odboru ${supervisorVerb} formulář Vyhodnocení zkušební doby níže uvedeného zaměstnance. Vyplněný formulář naleznete v PDF příloze. Prosíme o vyjádření (souhlas/nesouhlas s doporučením) přes odkaz níže.
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
    `vedoucí odboru ${supervisorVerb} formulář Vyhodnocení zkušební doby níže uvedeného zaměstnance. Vyplněný formulář naleznete v PDF příloze. Prosíme o vyjádření (souhlas/nesouhlas s doporučením) přes odkaz níže.`,
    "",
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.supervisorName ? `Vedoucí / hodnotitel: ${args.supervisorName}` : "",
    args.supervisorEmail ? `E-mail vedoucího: ${args.supervisorEmail}` : "",
    args.recommendation ? `Doporučení: ${args.recommendation}` : "",
    args.evaluatorName ? `Hodnotil(a): ${args.evaluatorName}` : "",
    args.evaluatorEmail ? `E-mail hodnotitele: ${args.evaluatorEmail}` : "",
    `Odkaz: ${args.evaluationLink}`,
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
    `Zaměstnanec: ${args.employeeName}`,
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    `Konec zkušební doby: ${fmtDate(args.probationEndDate)}`,
    args.supervisorName ? `Vedoucí / hodnotitel: ${args.supervisorName}` : "",
    args.supervisorEmail ? `E-mail vedoucího: ${args.supervisorEmail}` : "",
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
                      ? `<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">Uložil(a): ${escapeHtml(args.completedByName.trim())}</p>`
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
}

export async function sendHandoverRecipientEmail({
  to,
  employeeName,
  employeePosition,
  employeeDepartment,
  employmentEndDate,
  option3Reason,
}: SendHandoverRecipientEmailParams): Promise<void> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const greeting = "Dobrý den,"
  const subject = `Informace k předávané agendě – ${employeeName}`

  const reasonText = option3Reason?.trim()
    ? option3Reason.trim()
    : "dle údajů uvedených ve výstupním listu"

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

              <p style="margin:0;font-size:13px;color:#6b7280;">
                Zpráva byla odeslána prostřednictvím aplikace On-Off-Boarding ÚMČ Praha&nbsp;6.
              </p>
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
                    výstupní list zaměstnance/zaměstnankyně
                    <strong>${escapeHtml(employeeName)}</strong>
                    byl kompletně vyplněn a podepsán.
                  </p>

                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px 0;">
                    <tr>
                      <td bgcolor="${bgLight}" style="padding:12px 16px;border:1px solid #d9ece7;border-radius:8px;font-size:13px;color:#0B4A46;line-height:1.5;">
                        ${
                          pdfBuffer
                            ? "V příloze najdete podepsané PDF výstupního listu."
                            : "Nezapomeňte prosím zaslat podepsanou PDF verzi výstupního listu danému zaměstnanci/zaměstnankyni."
                        }
                        ${
                          employeeNotified
                            ? " Zaměstnanci/zaměstnankyni byla automaticky zaslána informace o dokončení a výzva k vyzvednutí zápočtového listu."
                            : ""
                        }
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

                  <p style="margin:0;word-break:break-all;">
                    <a href="${escapeHtml(checklistUrl)}" style="font-family:monospace;font-size:12px;color:${primary};">
                      ${escapeHtml(checklistUrl)}
                    </a>
                  </p>
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
  </html>`

  const text = [
    `výstupní list je kompletně vyplněn – ${employeeName}`,
    "",
    pdfBuffer
      ? "V příloze najdete podepsané PDF výstupního listu."
      : "Nezapomeňte prosím zaslat podepsanou PDF verzi výstupního listu danému zaměstnanci/zaměstnankyni.",
    employeeNotified
      ? "Zaměstnanci/zaměstnankyni byla automaticky zaslána informace o dokončení a výzva k vyzvednutí zápočtového listu."
      : "",
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
    "Váš výstupní list byl kompletně vyplněn a podepsán všemi zúčastněnými stranami. Pro vyzvednutí zápočtového listu se prosím dostavte na Personální oddělení.",
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

type EmploymentDocumentEmailInfo = {
  employeeName: string
  employeePersonalNumber?: string | null
  employeePosition?: string | null
  employeeDepartment?: string | null
  employeeUnitName?: string | null
}

export async function sendEmploymentDocumentLinkEmail(
  args: EmploymentDocumentEmailInfo & {
    to: string
    documents: Array<{ label: string; url: string }>
  }
): Promise<{ subject: string; html: string }> {
  const primary = "#00847C"
  const bgLight = "#E5F5F2"
  const subject = args.employeeName
    ? `Dokumenty k nástupu – ${args.employeeName}`
    : "Dokumenty k nástupu"

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
                    Dobrý den${args.employeeName ? `, ${escapeHtml(args.employeeName)}` : ""},
                  </p>

                  <p style="margin:0 0 18px 0;font-size:14px;color:#374151;line-height:1.6;">
                    prosíme o vyplnění následujících dokumentů pro uvedenou pozici.
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
                      .map(
                        (document, index) => `
                      <tr bgcolor="${index % 2 === 0 ? bgLight : "#ffffff"}" style="background-color:${index % 2 === 0 ? bgLight : "#ffffff"};">
                        <td style="padding:10px 16px;font-size:14px;color:#082B2A;font-weight:700;">
                          ${escapeHtml(document.label)}
                        </td>
                        <td style="padding:10px 16px;font-size:12px;">
                          <a href="${escapeHtml(document.url)}" style="color:${primary};word-break:break-all;">${escapeHtml(document.url)}</a>
                        </td>
                      </tr>
                    `
                      )
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
  </html>`

  const text = [
    `Dobrý den${args.employeeName ? `, ${args.employeeName}` : ""},`,
    "",
    "prosíme o vyplnění následujících dokumentů pro uvedenou pozici:",
    "",
    `Zaměstnanec: ${args.employeeName}`,
    args.employeePersonalNumber
      ? `Osobní číslo: ${args.employeePersonalNumber}`
      : "",
    `Pozice: ${args.employeePosition || "—"}`,
    `Odbor: ${args.employeeDepartment || "—"}`,
    `Oddělení: ${args.employeeUnitName || "—"}`,
    "",
    ...args.documents.map((document) => `${document.label}: ${document.url}`),
    "",
    "Odkazy jsou určeny pouze pro vás – nepřeposílejte je dalším osobám.",
  ]
    .filter(Boolean)
    .join("\n")

  await sendMail({ to: [args.to], subject, html, text })

  return { subject, html }
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
