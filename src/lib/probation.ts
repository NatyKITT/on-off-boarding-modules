import { randomBytes } from "crypto"

import type { PositionType, Prisma, ProbationFormType } from "@prisma/client"
import { addDays } from "date-fns"

export function getProbationFormType(
  positionType?: PositionType | null
): ProbationFormType {
  return positionType === "MANAGERIAL" ? "MANAGERIAL" : "REGULAR_EMPLOYEE"
}

export async function ensureProbationDocumentDraft(
  tx: Prisma.TransactionClient,
  onboardingId: number,
  formType: ProbationFormType
) {
  await tx.employmentDocument.upsert({
    where: {
      onboardingId_type: {
        onboardingId,
        type: "PROBATION_EVALUATION",
      },
    },
    update: {
      data: {
        formType,
      },
    },
    create: {
      onboardingId,
      type: "PROBATION_EVALUATION",
      status: "DRAFT",
      data: {
        formType,
      },
    },
  })
}

export async function ensureProbationHash(
  tx: Prisma.TransactionClient,
  onboardingId: number,
  currentHash: string | null | undefined,
  probationEnd: Date | null | undefined
) {
  if (currentHash) {
    return {
      hash: currentHash,
      expiresAt: probationEnd
        ? addDays(new Date(probationEnd), 30)
        : addDays(new Date(), 30),
    }
  }

  const hash = randomBytes(32).toString("hex")
  const expiresAt = probationEnd
    ? addDays(new Date(probationEnd), 30)
    : addDays(new Date(), 30)

  await tx.employeeOnboarding.update({
    where: { id: onboardingId },
    data: {
      probationEvaluationHash: hash,
      probationHashExpiresAt: expiresAt,
    },
  })

  return { hash, expiresAt }
}
