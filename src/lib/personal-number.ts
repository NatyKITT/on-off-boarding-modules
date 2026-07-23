import { prisma } from "@/lib/db"
import { getLastDc2PersonalNumber } from "@/lib/eos-personal"

import type { PersonalNumberMeta } from "@/components/forms/onboarding-form"

export async function getPersonalNumberMeta(): Promise<PersonalNumberMeta> {
  const rows = await prisma.employeeOnboarding.findMany({
    where: { personalNumber: { not: null } },
    select: { personalNumber: true, name: true, surname: true },
  })

  let lastUsed: (typeof rows)[number] | null = null
  let lastUsedNum = -Infinity

  for (const row of rows) {
    const raw = row.personalNumber?.trim()
    if (!raw || !/^\d+$/.test(raw)) continue

    const n = Number(raw)
    if (n > lastUsedNum) {
      lastUsedNum = n
      lastUsed = row
    }
  }

  const skipped = await prisma.personalNumberGap.findMany({
    where: { status: "SKIPPED" },
    orderBy: { number: "asc" },
    select: { number: true },
  })

  const eos = await getLastDc2PersonalNumber()

  return {
    lastDc2Number: eos.number,
    lastDc2AssignedTo: eos.name,
    lastUsedNumber: lastUsed?.personalNumber ?? null,
    lastUsedName: lastUsed
      ? `${lastUsed.name} ${lastUsed.surname}`.trim()
      : null,
    skippedNumbers: skipped.map((s) => s.number),
  }
}
