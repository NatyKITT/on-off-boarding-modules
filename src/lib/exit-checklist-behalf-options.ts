import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

export type BehalfOption = {
  value: string
  departmentLabel: string
  responsibleName: string
  selectLabel: string
  displayLabel: string
  obligations: string[]
  rowKeys: string[]
}

function cleanText(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function normalizeKey(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
}

function stripOfficeInfo(value: string): string {
  return cleanText(value)
    .replace(/\s*[-–—]\s*č\.\s*dv\..*$/i, "")
    .replace(/\s*č\.\s*dv\..*$/i, "")
    .trim()
}

function looksLikePersonName(value: string): boolean {
  const cleaned = stripOfficeInfo(value)
  if (!cleaned) return false

  const lower = cleaned.toLowerCase()

  const nonPersonWords = [
    "odbor",
    "oddělení",
    "kancelář",
    "přízemí",
    "patro",
    "místnost",
    "správa objektu",
    "kitt6,",
    "dr. zikmunda",
  ]

  if (nonPersonWords.some((word) => lower.includes(word))) {
    return false
  }

  if (/^(mgr|ing|bc|mga|judr|mudr|phdr|rndr|doc|prof)\./i.test(cleaned)) {
    return true
  }

  const withoutTitles = cleaned
    .replace(/\b(mgr|ing|bc|mga|judr|mudr|phdr|rndr|doc|prof)\.\s*/gi, "")
    .replace(/\b(dis|ph\.d|csc)\.?\b/gi, "")
    .trim()

  const words = withoutTitles.split(/\s+/).filter(Boolean)

  return (
    words.length >= 2 &&
    words
      .slice(0, 2)
      .every((word) => /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+/.test(word))
  )
}

function splitOrganization(organization: string) {
  const lines = organization.split("\n").map(cleanText).filter(Boolean)
  const departmentLabel = lines[0] ?? cleanText(organization)

  return {
    departmentLabel,
    detailLines: lines.slice(1),
  }
}

function getResponsibleName(
  organization: string,
  managerName?: string | null
): string {
  const { departmentLabel, detailLines } = splitOrganization(organization)

  if (normalizeKey(departmentLabel) === normalizeKey("Vedoucí odboru")) {
    return cleanText(managerName) || "Vedoucí odboru"
  }

  const personLine = detailLines.find(looksLikePersonName)

  if (personLine) {
    return stripOfficeInfo(personLine)
  }

  return ""
}

export function buildBehalfOptions(
  managerName?: string | null
): BehalfOption[] {
  const optionsByKey = new Map<string, BehalfOption>()

  for (const row of EXIT_CHECKLIST_ROWS) {
    const { departmentLabel } = splitOrganization(row.organization)
    const responsibleName = getResponsibleName(row.organization, managerName)

    const groupKey = `${normalizeKey(departmentLabel)}|${normalizeKey(
      responsibleName
    )}`

    const obligation = cleanText(row.obligation)

    const existing = optionsByKey.get(groupKey)
    if (existing) {
      if (obligation && !existing.obligations.includes(obligation)) {
        existing.obligations.push(obligation)
      }
      existing.rowKeys.push(row.key)
      continue
    }

    const displayLabel = responsibleName
      ? `${departmentLabel} — ${responsibleName}`
      : departmentLabel

    optionsByKey.set(groupKey, {
      value: groupKey,
      departmentLabel,
      responsibleName,
      selectLabel: displayLabel,
      displayLabel,
      obligations: obligation ? [obligation] : [],
      rowKeys: [row.key],
    })
  }

  return Array.from(optionsByKey.values())
}

export function formatObligations(obligations: string[]): string {
  if (obligations.length === 0) return "—"
  if (obligations.length <= 3) return obligations.join("; ")

  return `${obligations.slice(0, 3).join("; ")} a další ${
    obligations.length - 3
  }`
}
