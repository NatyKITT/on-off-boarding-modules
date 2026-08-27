import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
import {
  getLastDc2PersonalNumber,
  getLastSpecialPersonalNumber,
} from "@/lib/eos-personal"

import type { PersonalNumberMeta } from "@/components/forms/onboarding-form"

export async function getPersonalNumberMeta(): Promise<PersonalNumberMeta> {
  const rows = await prisma.employeeOnboarding.findMany({
    where: { personalNumber: { not: null } },
    select: { personalNumber: true, name: true, surname: true },
  })

  const usedNumbers = new Set<number>()
  let lastUsed: (typeof rows)[number] | null = null
  let lastUsedNum = -Infinity

  for (const row of rows) {
    const raw = row.personalNumber?.trim()
    if (!raw || !/^\d{4}$/.test(raw)) continue

    const n = Number(raw)
    usedNumbers.add(n)

    if (n > lastUsedNum) {
      lastUsedNum = n
      lastUsed = row
    }
  }

  const eosEmployees = await getEmployees("")
  const eosNumbers = new Set<number>()

  for (const employee of eosEmployees) {
    const raw = employee.personalNumber?.trim()
    if (!raw || !/^\d{4}$/.test(raw)) continue
    eosNumbers.add(Number(raw))
    usedNumbers.add(Number(raw))
  }

  const eos = await getLastDc2PersonalNumber(eosEmployees)
  if (eos.number && /^\d{4}$/.test(eos.number)) {
    const n = Number(eos.number)
    if (n > lastUsedNum) lastUsedNum = n
  }

  const special = await getLastSpecialPersonalNumber(eosEmployees)

  const persistedGaps = await prisma.personalNumberGap.findMany({
    where: { status: "SKIPPED" },
    orderBy: { number: "asc" },
    select: { number: true },
  })

  const skippedNumbers = new Set<string>()

  for (const gap of persistedGaps) {
    if (/^\d{4}$/.test(gap.number) && !usedNumbers.has(Number(gap.number))) {
      skippedNumbers.add(gap.number)
    }
  }

  if (Number.isFinite(lastUsedNum) && usedNumbers.size > 0) {
    const firstNum = Math.min(...usedNumbers)

    for (let n = firstNum + 1; n < lastUsedNum; n++) {
      if (!usedNumbers.has(n)) {
        skippedNumbers.add(String(n).padStart(4, "0"))
      }
    }
  }

  return {
    lastDc2Number: eos.number,
    lastDc2AssignedTo: eos.name,
    lastUsedNumber: lastUsed?.personalNumber ?? null,
    lastUsedName: lastUsed
      ? `${lastUsed.name} ${lastUsed.surname}`.trim()
      : null,
    lastUsedNumberInEos: lastUsed ? eosNumbers.has(lastUsedNum) : undefined,
    lastSpecialNumber: special.number,
    lastSpecialAssignedTo: special.name,
    skippedNumbers: Array.from(skippedNumbers).sort(
      (a, b) => Number(a) - Number(b)
    ),
  }
}
