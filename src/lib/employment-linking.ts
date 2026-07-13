export type DateLike = Date | string | null | undefined

export type LinkableWithPersonalNumber = {
  personalNumber?: string | null
}

export type MinimalOffboardingLink = {
  id: number
  personalNumber: string | null
  plannedEnd: DateLike
  actualEnd: DateLike
}

export type MinimalOnboardingLink = {
  id: number
  personalNumber: string | null
  plannedStart: DateLike
  actualStart: DateLike
  probationEnd: DateLike
  positionName?: string | null
}

export type MinimalEmployeeChangeLink = {
  id: number
  personalNumber: string | null
  type: string
  status: string
  effectiveDate: DateLike

  oldTitleBefore?: string | null
  newTitleBefore?: string | null
  oldName?: string | null
  newName?: string | null
  oldSurname?: string | null
  newSurname?: string | null
  oldTitleAfter?: string | null
  newTitleAfter?: string | null

  oldDepartment?: string | null
  newDepartment?: string | null
  oldUnitName?: string | null
  newUnitName?: string | null
  oldPositionName?: string | null
  newPositionName?: string | null
  oldPositionNum?: string | null
  newPositionNum?: string | null
}

export type LinkedOffboardingInfo = {
  id: number
  plannedEnd: string | null
  actualEnd: string | null
  exitDate: string | null
  isActualExit: boolean
  leftDuringProbation: boolean
  probationShouldBeStopped: boolean
  rowMuted: boolean
  label: string
  description: string
}

export type LinkedOnboardingInfo = {
  id: number
  plannedStart: string | null
  actualStart: string | null
  probationEnd: string | null
  positionName: string | null
  exitDuringProbation: boolean
  label: string
  description: string
}

export type LinkedEmployeeChangeInfo = {
  id: number
  type: string
  status: string
  effectiveDate: string | null
  affectsName: boolean
  affectsPosition: boolean
  isApplied: boolean
  label: string
  description: string

  changedFields?: string[]
  detail?: string
  effectiveDateLabel?: string
  rowMuted?: boolean
}

export function normalizePersonalNumber(value?: string | null) {
  return (value ?? "").replace(/\s+/g, "").trim()
}

export function collectNormalizedPersonalNumbers<
  T extends LinkableWithPersonalNumber,
>(rows: T[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => normalizePersonalNumber(row.personalNumber))
        .filter((value): value is string => value.length > 0)
    )
  )
}

export function groupByNormalizedPersonalNumber<
  T extends LinkableWithPersonalNumber,
>(rows: T[]) {
  const grouped = new Map<string, T[]>()

  for (const row of rows) {
    const personalNumber = normalizePersonalNumber(row.personalNumber)

    if (!personalNumber) continue

    const current = grouped.get(personalNumber) ?? []
    current.push(row)
    grouped.set(personalNumber, current)
  }

  return grouped
}

function toDate(value: DateLike): Date | null {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(value: DateLike): string | null {
  const date = toDate(value)

  return date ? date.toISOString() : null
}

function formatDateCz(value: DateLike): string {
  const date = toDate(value)

  if (!date) return "—"

  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1
  ).padStart(2, "0")}.${date.getFullYear()}`
}

function isSameOrBefore(a: DateLike, b: DateLike): boolean {
  const dateA = toDate(a)
  const dateB = toDate(b)

  if (!dateA || !dateB) return false

  return dateA.getTime() <= dateB.getTime()
}

function hasValue(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0
}

function displayValue(value?: string | null) {
  return hasValue(value) ? value!.trim() : "—"
}

export function isEmployeeNameChange(type: string) {
  return type === "NAME" || type === "NAME_AND_POSITION"
}

export function isEmployeePositionChange(type: string) {
  return type === "POSITION" || type === "NAME_AND_POSITION"
}

export function getEmployeeChangeTypeLabel(type: string) {
  if (type === "NAME") return "Změna jména / titulu"
  if (type === "POSITION") return "Změna pozice / odboru"
  if (type === "NAME_AND_POSITION") return "Změna jména i pozice"

  return "Změna"
}

function hasChanged(oldValue?: string | null, newValue?: string | null) {
  return (oldValue ?? null) !== (newValue ?? null)
}

function buildChangedFields(change: MinimalEmployeeChangeLink) {
  const fields: string[] = []

  if (isEmployeeNameChange(change.type)) {
    if (
      hasChanged(change.oldTitleBefore, change.newTitleBefore) &&
      (hasValue(change.oldTitleBefore) || hasValue(change.newTitleBefore))
    ) {
      fields.push("titleBefore")
    }

    if (
      hasChanged(change.oldName, change.newName) &&
      hasValue(change.newName)
    ) {
      fields.push("name")
    }

    if (
      hasChanged(change.oldSurname, change.newSurname) &&
      hasValue(change.newSurname)
    ) {
      fields.push("surname")
    }

    if (
      hasChanged(change.oldTitleAfter, change.newTitleAfter) &&
      (hasValue(change.oldTitleAfter) || hasValue(change.newTitleAfter))
    ) {
      fields.push("titleAfter")
    }
  }

  if (isEmployeePositionChange(change.type)) {
    if (
      hasChanged(change.oldDepartment, change.newDepartment) &&
      (hasValue(change.oldDepartment) || hasValue(change.newDepartment))
    ) {
      fields.push("department")
    }

    if (
      hasChanged(change.oldUnitName, change.newUnitName) &&
      (hasValue(change.oldUnitName) || hasValue(change.newUnitName))
    ) {
      fields.push("unitName")
    }

    if (
      hasChanged(change.oldPositionName, change.newPositionName) &&
      (hasValue(change.oldPositionName) || hasValue(change.newPositionName))
    ) {
      fields.push("positionName")
    }

    if (
      hasChanged(change.oldPositionNum, change.newPositionNum) &&
      (hasValue(change.oldPositionNum) || hasValue(change.newPositionNum))
    ) {
      fields.push("positionNum")
    }
  }

  return fields
}

function buildChangeSummary(change: MinimalEmployeeChangeLink) {
  const parts: string[] = []

  if (isEmployeeNameChange(change.type)) {
    if (
      hasChanged(change.oldTitleBefore, change.newTitleBefore) &&
      (hasValue(change.oldTitleBefore) || hasValue(change.newTitleBefore))
    ) {
      parts.push(
        `titul před: původně ${displayValue(change.oldTitleBefore)}, nově ${displayValue(
          change.newTitleBefore
        )}`
      )
    }

    if (
      hasChanged(change.oldName, change.newName) &&
      hasValue(change.newName)
    ) {
      parts.push(
        `jméno: původně ${displayValue(change.oldName)}, nově ${displayValue(
          change.newName
        )}`
      )
    }

    if (
      hasChanged(change.oldSurname, change.newSurname) &&
      hasValue(change.newSurname)
    ) {
      parts.push(
        `příjmení: původně ${displayValue(change.oldSurname)}, nově ${displayValue(
          change.newSurname
        )}`
      )
    }

    if (
      hasChanged(change.oldTitleAfter, change.newTitleAfter) &&
      (hasValue(change.oldTitleAfter) || hasValue(change.newTitleAfter))
    ) {
      parts.push(
        `titul za: původně ${displayValue(change.oldTitleAfter)}, nově ${displayValue(
          change.newTitleAfter
        )}`
      )
    }
  }

  if (isEmployeePositionChange(change.type)) {
    if (
      hasChanged(change.oldDepartment, change.newDepartment) &&
      (hasValue(change.oldDepartment) || hasValue(change.newDepartment))
    ) {
      parts.push(
        `odbor: původně ${displayValue(change.oldDepartment)}, nově ${displayValue(
          change.newDepartment
        )}`
      )
    }

    if (
      hasChanged(change.oldUnitName, change.newUnitName) &&
      (hasValue(change.oldUnitName) || hasValue(change.newUnitName))
    ) {
      parts.push(
        `oddělení: původně ${displayValue(change.oldUnitName)}, nově ${displayValue(
          change.newUnitName
        )}`
      )
    }

    if (
      hasChanged(change.oldPositionName, change.newPositionName) &&
      (hasValue(change.oldPositionName) || hasValue(change.newPositionName))
    ) {
      parts.push(
        `pozice: původně ${displayValue(change.oldPositionName)}, nově ${displayValue(
          change.newPositionName
        )}`
      )
    }

    if (
      hasChanged(change.oldPositionNum, change.newPositionNum) &&
      (hasValue(change.oldPositionNum) || hasValue(change.newPositionNum))
    ) {
      parts.push(
        `č. funkce: původně ${displayValue(change.oldPositionNum)}, nově ${displayValue(
          change.newPositionNum
        )}`
      )
    }
  }

  return parts.length > 0 ? parts.join("; ") : "bez detailu změny"
}

export function pickMostRelevantOffboarding<T extends MinimalOffboardingLink>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null

  return [...rows].sort((a, b) => {
    const dateA = toDate(a.actualEnd ?? a.plannedEnd)?.getTime() ?? 0
    const dateB = toDate(b.actualEnd ?? b.plannedEnd)?.getTime() ?? 0

    return dateB - dateA
  })[0]
}

export function pickMostRelevantOnboarding<T extends MinimalOnboardingLink>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null

  return [...rows].sort((a, b) => {
    const dateA = toDate(a.actualStart ?? a.plannedStart)?.getTime() ?? 0
    const dateB = toDate(b.actualStart ?? b.plannedStart)?.getTime() ?? 0

    return dateB - dateA
  })[0]
}

export function pickMostRelevantEmployeeChange<
  T extends MinimalEmployeeChangeLink,
>(rows: T[]): T | null {
  if (rows.length === 0) return null

  return [...rows].sort((a, b) => {
    const dateA = toDate(a.effectiveDate)?.getTime() ?? 0
    const dateB = toDate(b.effectiveDate)?.getTime() ?? 0

    return dateB - dateA
  })[0]
}

export function buildLinkedOffboardingInfo(params: {
  offboarding: MinimalOffboardingLink | null
  probationEnd: DateLike
}): LinkedOffboardingInfo | null {
  const { offboarding, probationEnd } = params

  if (!offboarding) return null

  const exitDate = offboarding.actualEnd ?? offboarding.plannedEnd
  const isActualExit = Boolean(offboarding.actualEnd)
  const leftDuringProbation = Boolean(
    probationEnd && exitDate && isSameOrBefore(exitDate, probationEnd)
  )

  const probationShouldBeStopped = leftDuringProbation

  if (leftDuringProbation) {
    return {
      id: offboarding.id,
      plannedEnd: toIso(offboarding.plannedEnd),
      actualEnd: toIso(offboarding.actualEnd),
      exitDate: toIso(exitDate),
      isActualExit,
      leftDuringProbation,
      probationShouldBeStopped,
      rowMuted: true,
      label: isActualExit
        ? "Odešel ve zkušebce"
        : "Plánovaný odchod ve zkušebce",
      description: isActualExit
        ? `Zaměstnanec má skutečný odchod ${formatDateCz(
          exitDate
        )}. Zkušební doba se dále nevyhodnocuje.`
        : `Zaměstnanec má plánovaný odchod ${formatDateCz(
          exitDate
        )} ještě v průběhu zkušební doby.`,
    }
  }

  return {
    id: offboarding.id,
    plannedEnd: toIso(offboarding.plannedEnd),
    actualEnd: toIso(offboarding.actualEnd),
    exitDate: toIso(exitDate),
    isActualExit,
    leftDuringProbation: false,
    probationShouldBeStopped: false,
    rowMuted: isActualExit,
    label: isActualExit ? "Zaměstnanec odešel" : "Má plánovaný odchod",
    description: isActualExit
      ? `Zaměstnanec má skutečný odchod ${formatDateCz(exitDate)}.`
      : `Zaměstnanec má založený plánovaný odchod ${formatDateCz(exitDate)}.`,
  }
}

export function buildLinkedOnboardingInfo(params: {
  onboarding: MinimalOnboardingLink | null
  exitDate: DateLike
}): LinkedOnboardingInfo | null {
  const { onboarding, exitDate } = params

  if (!onboarding) return null

  const exitDuringProbation = Boolean(
    onboarding.probationEnd &&
    exitDate &&
    isSameOrBefore(exitDate, onboarding.probationEnd)
  )

  return {
    id: onboarding.id,
    plannedStart: toIso(onboarding.plannedStart),
    actualStart: toIso(onboarding.actualStart),
    probationEnd: toIso(onboarding.probationEnd),
    positionName: onboarding.positionName ?? null,
    exitDuringProbation,
    label: exitDuringProbation ? "Odchod ve zkušebce" : "Existuje v nástupech",
    description: exitDuringProbation
      ? `Osobní číslo je propojené s nástupem. Odchod spadá do zkušební doby ukončené ${formatDateCz(
        onboarding.probationEnd
      )}.`
      : "Osobní číslo je propojené se záznamem v nástupech.",
  }
}

export function buildLinkedEmployeeChangeInfo(
  change: MinimalEmployeeChangeLink | null
): LinkedEmployeeChangeInfo | null {
  if (!change) return null

  const affectsName = isEmployeeNameChange(change.type)
  const affectsPosition = isEmployeePositionChange(change.type)
  const isApplied = change.status === "APPLIED"
  const changedFields = buildChangedFields(change)
  const detail = buildChangeSummary(change)
  const effectiveDateLabel = formatDateCz(change.effectiveDate)

  return {
    id: change.id,
    type: change.type,
    status: change.status,
    effectiveDate: toIso(change.effectiveDate),
    affectsName,
    affectsPosition,
    isApplied,
    label: isApplied
      ? "Aplikovaná změna"
      : getEmployeeChangeTypeLabel(change.type),
    description: `${getEmployeeChangeTypeLabel(
      change.type
    )} s účinností ${effectiveDateLabel}: ${detail}.`,
    changedFields,
    detail,
    effectiveDateLabel,
    rowMuted: change.status === "CANCELLED",
  }
}

export function buildLinkedEmployeeChangeInfos<
  T extends MinimalEmployeeChangeLink,
>(changes: T[], limit = 5): LinkedEmployeeChangeInfo[] {
  return [...changes]
    .sort((a, b) => {
      const dateA = toDate(a.effectiveDate)?.getTime() ?? 0
      const dateB = toDate(b.effectiveDate)?.getTime() ?? 0

      return dateB - dateA
    })
    .slice(0, limit)
    .map((change) => buildLinkedEmployeeChangeInfo(change))
    .filter((change): change is LinkedEmployeeChangeInfo => Boolean(change))
}

export function shouldSkipProbationEvaluation(params: {
  probationEnd: DateLike
  linkedOffboarding: MinimalOffboardingLink | null
}) {
  const { probationEnd, linkedOffboarding } = params

  if (!probationEnd || !linkedOffboarding) return false

  const exitDate = linkedOffboarding.actualEnd ?? linkedOffboarding.plannedEnd

  return Boolean(exitDate && isSameOrBefore(exitDate, probationEnd))
}
