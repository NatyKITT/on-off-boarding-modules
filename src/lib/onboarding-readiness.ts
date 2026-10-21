import { prisma } from "@/lib/db"
import { ONBOARDING_TYPES } from "@/lib/employment-documents"

export async function isOnboardingDocumentsComplete(
  onboardingId: number
): Promise<boolean> {
  const documents = await prisma.employmentDocument.findMany({
    where: { onboardingId, type: { in: ONBOARDING_TYPES } },
    select: { type: true, status: true },
  })

  if (documents.length < ONBOARDING_TYPES.length) return false

  return documents.every((document) => document.status !== "DRAFT")
}

export async function recomputeOnboardingReadiness(
  onboardingId: number
): Promise<void> {
  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: { id: onboardingId, deletedAt: null },
    select: {
      documentsReadinessStatus: true,
      medicalExamRequestSentAt: true,
    },
  })

  if (!onboarding) return
  if (onboarding.documentsReadinessStatus === "LOCKED") return

  const documentsComplete = await isOnboardingDocumentsComplete(onboardingId)
  const medicalExamSent = Boolean(onboarding.medicalExamRequestSentAt)
  const isReady = documentsComplete && medicalExamSent

  const nextStatus = isReady ? "READY" : "IN_PROGRESS"

  if (nextStatus === onboarding.documentsReadinessStatus) return

  await prisma.employeeOnboarding.update({
    where: { id: onboardingId },
    data: {
      documentsReadinessStatus: nextStatus,
      documentsReadyAt: isReady ? new Date() : null,
    },
  })
}
