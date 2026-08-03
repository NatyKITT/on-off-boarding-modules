const DEFAULT_TIME_ZONE = "Europe/Prague"

export function getLocalHour(date: Date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  })

  const hourPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value

  const hour = hourPart ? Number(hourPart) : date.getUTCHours()

  return hour === 24 ? 0 : hour
}

export function isLocalHourNow(
  targetHour: number,
  timeZone = DEFAULT_TIME_ZONE,
  now = new Date()
) {
  return getLocalHour(now, timeZone) === targetHour
}
