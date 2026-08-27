import { absoluteUrl } from "@/lib/url"

export type CalendarEvent = {
  uid?: string
  title: string
  description?: string
  date: string
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, "")
}

function addDaysToIcsDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

function foldIcsLine(line: string): string {
  if (line.length <= 74) return line

  const parts: string[] = [line.slice(0, 74)]
  let rest = line.slice(74)

  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`)
    rest = rest.slice(73)
  }

  return parts.join("\r\n")
}

function buildDtstamp(): string {
  const now = new Date()
  return (
    `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}` +
    `T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  )
}

export function buildIcsCalendar(events: CalendarEvent[]): string {
  const dtstamp = buildDtstamp()
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KITT6//On-Off-Boarding Modul//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]

  events.forEach((event, index) => {
    const start = toIcsDate(event.date)
    const end = addDaysToIcsDate(event.date, 1)
    const uid =
      event.uid?.trim() || `${start}-${index}-${dtstamp}@on-off-boarding`

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`)
    )

    if (event.description) {
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description)}`))
    }

    lines.push("END:VEVENT")
  })

  lines.push("END:VCALENDAR")

  return lines.join("\r\n")
}

export function buildGoogleCalendarLink(event: CalendarEvent): string {
  const start = toIcsDate(event.date)
  const end = addDaysToIcsDate(event.date, 1)

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  })

  if (event.description) params.set("details", event.description)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildIcsDownloadLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    title: event.title,
    date: event.date,
  })

  if (event.description) params.set("description", event.description)

  return absoluteUrl(`/api/kalendar/ics?${params.toString()}`)
}

export function buildCalendarLinksHtml(event: CalendarEvent): string {
  const googleUrl = buildGoogleCalendarLink(event)
  const icsUrl = buildIcsDownloadLink(event)

  return (
    `<span style="white-space:nowrap;font-size:11px;">` +
    `<a href="${googleUrl}" target="_blank" rel="noopener" style="color:#00847C;text-decoration:none;">📅 Google</a>` +
    `&nbsp;·&nbsp;` +
    `<a href="${icsUrl}" target="_blank" rel="noopener" style="color:#00847C;text-decoration:none;">.ics (Outlook/Apple)</a>` +
    `</span>`
  )
}
