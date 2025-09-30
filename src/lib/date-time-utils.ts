/**
 * Formátování datumu do evropského formátu (dd.mm.yyyy)
 */
export const formatDateEuropean = (
  date: Date | string | null | undefined
): string => {
  if (!date) return ""
  try {
    const d = typeof date === "string" ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch (error) {
    console.error("Error formatting date:", error)
    return ""
  }
}

/**
 * Formátování času do evropského formátu (HH:mm)
 */
export const formatTimeEuropean = (time: string | null | undefined): string => {
  if (!time) return ""
  try {
    if (time.includes(":")) {
      const [hStr = "", mStr = ""] = time.split(":")
      const hours = hStr.padStart(2, "0")
      const minutes = mStr.padStart(2, "0")
      // jednoduchá validace 00–23 : 00–59
      const hNum = Number(hours)
      const mNum = Number(minutes)
      if (
        Number.isInteger(hNum) &&
        Number.isInteger(mNum) &&
        hNum >= 0 &&
        hNum <= 23 &&
        mNum >= 0 &&
        mNum <= 59
      ) {
        return `${hours}:${minutes}`
      }
    }
    return ""
  } catch (error) {
    console.error("Error formatting time:", error)
    return ""
  }
}

/**
 * Formátování datumu a času do evropského formátu
 */
export const formatDateTimeEuropean = (
  datetime: Date | string | null | undefined
): string => {
  if (!datetime) return ""
  try {
    const d = typeof datetime === "string" ? new Date(datetime) : datetime
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch (error) {
    console.error("Error formatting datetime:", error)
    return ""
  }
}

/**
 * Zaokrouhlení času na nejbližší půlhodinu
 */
export const roundToHalfHour = (time: string | null | undefined): string => {
  if (!time) return "09:00"
  try {
    const [hStr = "9", mStr = "0"] = time.split(":")
    const h = Number(hStr)
    const m = Number(mStr)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "09:00"

    let total = h * 60 + m
    if (total < 0) total = 0
    // nejbližší 30 minut
    total = Math.round(total / 30) * 30
    // omezit na 23:30 max
    const max = 23 * 60 + 30
    if (total > max) total = max

    const hh = Math.floor(total / 60)
    const mm = total % 60
    return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`
  } catch (error) {
    console.error("Error rounding time:", error)
    return "09:00"
  }
}

/**
 * Výpočet konce zkušební doby
 */
export const calculateProbationEnd = (
  startDate: string | Date | null | undefined,
  months: number = 0
): string => {
  if (!startDate) return ""
  try {
    const base = typeof startDate === "string" ? new Date(startDate) : startDate
    if (Number.isNaN(base.getTime())) return ""

    const m = Number(months)
    if (!Number.isFinite(m) || m < 0) return ""

    const end = new Date(base) // neměnit vstup
    end.setMonth(end.getMonth() + m)

    // explicitně zajistíme string, i kdyby TS hádal `undefined`
    const parts = end.toISOString().split("T")
    return parts[0] ?? ""
  } catch (error) {
    console.error("Error calculating probation end:", error)
    return ""
  }
}

/**
 * Kontrola zda je pozice vedoucí
 */
export const isManagerPosition = (
  positionName: string | null | undefined
): boolean => {
  if (!positionName) return false
  const managerKeywords = [
    "vedoucí",
    "ředitel",
    "manager",
    "šéf",
    "vedení",
    "head",
    "director",
  ]
  const lower = positionName.toLowerCase()
  return managerKeywords.some((keyword) => lower.includes(keyword))
}

/**
 * Výpočet počtu dní mezi dvěma daty (celek nahoru)
 */
export const daysBetweenDates = (
  startDate: Date | string,
  endDate: Date | string
): number => {
  try {
    const start =
      typeof startDate === "string" ? new Date(startDate) : startDate
    const end = typeof endDate === "string" ? new Date(endDate) : endDate
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
    const timeDiff = end.getTime() - start.getTime()
    return Math.ceil(timeDiff / (1000 * 60 * 60 * 24))
  } catch (error) {
    console.error("Error calculating days between dates:", error)
    return 0
  }
}

/**
 * Získání názvu měsíce v češtině
 */
export const getMonthNameCzech = (
  monthIndex: number | null | undefined
): string => {
  const months = [
    "Leden",
    "Únor",
    "Březen",
    "Duben",
    "Květen",
    "Červen",
    "Červenec",
    "Srpen",
    "Září",
    "Říjen",
    "Listopad",
    "Prosinec",
  ] as const

  // bezpečné zúžení typu + kontrola rozsahu
  if (typeof monthIndex !== "number") return ""
  const idx = Math.trunc(monthIndex)
  if (idx < 0 || idx > 11) return ""

  // .at vrací string | undefined → koaleskujeme na ""
  return months.at(idx) ?? ""
}
