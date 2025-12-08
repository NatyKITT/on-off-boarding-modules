import { prisma } from "@/lib/db"
import { getLastDc2PersonalNumber } from "@/lib/eos-personal"

import type { PersonalNumberMeta } from "@/components/forms/onboarding-form"

export async function getPersonalNumberMeta(): Promise<PersonalNumberMeta> {
  const lastUsed = await prisma.employeeOnboarding.findFirst({
    where: { personalNumber: { not: null } },
    orderBy: { personalNumber: "desc" },
    select: { personalNumber: true, name: true, surname: true },
  })

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
