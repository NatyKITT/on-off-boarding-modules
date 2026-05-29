type DateLike = Date | string | null | undefined

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

export function normalizePersonalNumber(value?: string | null) {
  return (value ?? "").replace(/\s+/g, "").trim()
}

function toDate(value: DateLike): Date | null {
  if (!value) return null

  const d = value instanceof Date ? value : new Date(value)

  return Number.isNaN(d.getTime()) ? null : d
}

function toIso(value: DateLike): string | null {
  const d = toDate(value)

  return d ? d.toISOString() : null
}

function formatDateCz(value: DateLike): string {
  const d = toDate(value)

  if (!d) return "—"

  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${d.getFullYear()}`
}

function isSameOrBefore(a: DateLike, b: DateLike): boolean {
  const da = toDate(a)
  const db = toDate(b)

  if (!da || !db) return false

  return da.getTime() <= db.getTime()
}

export function pickMostRelevantOffboarding<T extends MinimalOffboardingLink>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null

  return [...rows].sort((a, b) => {
    const aDate = toDate(a.actualEnd ?? a.plannedEnd)?.getTime() ?? 0
    const bDate = toDate(b.actualEnd ?? b.plannedEnd)?.getTime() ?? 0

    return bDate - aDate
  })[0]
}

export function pickMostRelevantOnboarding<T extends MinimalOnboardingLink>(
  rows: T[]
): T | null {
  if (rows.length === 0) return null

  return [...rows].sort((a, b) => {
    const aDate = toDate(a.actualStart ?? a.plannedStart)?.getTime() ?? 0
    const bDate = toDate(b.actualStart ?? b.plannedStart)?.getTime() ?? 0

    return bDate - aDate
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
      label: isActualExit ? "Odešel ve zkušebce" : "Plánovaný odchod ve zkušebce",
      description: isActualExit
        ? `Zaměstnanec má skutečný odchod ${formatDateCz(exitDate)}. Zkušební doba se dále nevyhodnocuje.`
        : `Zaměstnanec má plánovaný odchod ${formatDateCz(exitDate)} ještě v průběhu zkušební doby.`,
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
      ? `Osobní číslo je propojené s nástupem. Odchod spadá do zkušební doby ukončené ${formatDateCz(onboarding.probationEnd)}.`
      : "Osobní číslo je propojené se záznamem v nástupech.",
  }
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
