import { getEmployees, type Employee } from "@/lib/eos-employees"

function buildEmployeeLabel(e: Employee): string {
  return [e.titleBefore ?? "", e.name, e.surname, e.titleAfter ?? ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function getLastDc2PersonalNumber(): Promise<{
  number: string | null
  name: string | null
}> {
  const employees = await getEmployees("")

  let best: Employee | null = null

  for (const e of employees) {
    const num = e.personalNumber?.trim()
    if (!num || !/^\d+$/.test(num)) continue

    if (!best) {
      best = e
      continue
    }

    if (parseInt(num, 10) > parseInt(best.personalNumber.trim(), 10)) {
      best = e
    }
  }

  if (!best) {
    return { number: null, name: null }
  }

  return {
    number: best.personalNumber.trim(),
    name: buildEmployeeLabel(best) || null,
  }
}
