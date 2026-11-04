import { prisma } from "@/lib/db"
import {
  getHrRecipientsFromEnv,
  sendEmploymentDocumentsLockedEmail,
  sendEmploymentDocumentsLockedHrEmail,
  sendEmploymentDocumentsUnlockedEmail,
  sendEmploymentDocumentsUnlockedHrEmail,
} from "@/lib/email"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"

type OnboardingBasicInfo = {
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  userEmail: string | null
  positionName: string
  department: string
  unitName: string
}

function buildEmployeeName(existing: OnboardingBasicInfo): string {
  return [
    existing.titleBefore,
    existing.name,
    existing.surname,
    existing.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
}

/**
 * Pokud má nástup nevyplněné nástupní dokumenty, informuje zaměstnance i HR,
 * že je přesunutím do neuskutečněných / smazáním záznamu již nemusí
 * vyplňovat. Nic nezamyká - jen notifikace, stejně jako u výstupního listu.
 */
export async function notifyEmploymentDocumentsRemoved(
  onboardingId: number,
  reason: "RECORD_CANCELLED" | "RECORD_DELETED"
): Promise<void> {
  const existing = await prisma.employeeOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      userEmail: true,
      positionName: true,
      department: true,
      unitName: true,
      medicalExamRequestSentAt: true,
      medicalExamSignedFiles: { select: { id: true }, take: 1 },
    },
  })

  if (!existing) return

  const draftDocuments = await prisma.employmentDocument.findMany({
    where: {
      onboardingId,
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
    },
    select: { type: true },
  })

  const medicalExamPending =
    Boolean(existing.medicalExamRequestSentAt) &&
    existing.medicalExamSignedFiles.length === 0

  if (draftDocuments.length === 0 && !medicalExamPending) return

  const employeeName = buildEmployeeName(existing)
  const documentLabels = [
    ...draftDocuments.map((document) => ({
      label: typeLabel(document.type),
    })),
    ...(medicalExamPending
      ? [{ label: "Žádost o pracovnělékařskou prohlídku" }]
      : []),
  ]

  if (existing.userEmail) {
    try {
      await sendEmploymentDocumentsLockedEmail({
        to: existing.userEmail,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: documentLabels,
        reason,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-NOTIFY] E-mail zaměstnanci se nepodařilo odeslat:",
        error
      )
    }
  }

  const hrRecipients = getHrRecipientsFromEnv()

  if (hrRecipients.length > 0) {
    try {
      await sendEmploymentDocumentsLockedHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: documentLabels,
        reason,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-NOTIFY] E-mail pro HR se nepodařilo odeslat:",
        error
      )
    }
  }
}

/**
 * Po obnovení nástupu ze smazaných nebo z neuskutečněných informuje
 * zaměstnance i HR, že nevyplněné nástupní dokumenty jsou znovu aktivní,
 * a zaměstnanci znovu posílá funkční odkazy (jen ty, co ještě neexpirovaly).
 */
export async function notifyEmploymentDocumentsAvailableAgain(
  onboardingId: number,
  baseUrl: string
): Promise<void> {
  const existing = await prisma.employeeOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      userEmail: true,
      positionName: true,
      department: true,
      unitName: true,
      medicalExamRequestSentAt: true,
      medicalExamSignedFiles: { select: { id: true }, take: 1 },
    },
  })

  if (!existing) return

  const now = new Date()

  const draftDocuments = await prisma.employmentDocument.findMany({
    where: {
      onboardingId,
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
    },
    select: { type: true, accessHash: true, expiresAt: true },
  })

  const medicalExamPending =
    Boolean(existing.medicalExamRequestSentAt) &&
    existing.medicalExamSignedFiles.length === 0

  const employeeName = buildEmployeeName(existing)
  const documentLinks = draftDocuments
    .filter(
      (document) =>
        document.accessHash && (!document.expiresAt || document.expiresAt > now)
    )
    .map((document) => ({
      label: typeLabel(document.type),
      url: `${baseUrl}/dokumenty/${document.accessHash}`,
    }))

  const extraNote = medicalExamPending
    ? "Žádost o pracovnělékařskou prohlídku, kterou jste dříve obdrželi, je znovu potřeba vyřídit. Ohledně dalšího postupu vás bude kontaktovat Personální oddělení."
    : null

  if (documentLinks.length === 0 && !medicalExamPending) return

  if (existing.userEmail) {
    try {
      await sendEmploymentDocumentsUnlockedEmail({
        to: existing.userEmail,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: documentLinks,
        reason: "RECORD_RESTORED",
        extraNote,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-NOTIFY] E-mail zaměstnanci se nepodařilo odeslat:",
        error
      )
    }
  }

  const hrRecipients = getHrRecipientsFromEnv()

  if (hrRecipients.length > 0) {
    try {
      await sendEmploymentDocumentsUnlockedHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: documentLinks,
        reason: "RECORD_RESTORED",
        extraNote,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-NOTIFY] E-mail pro HR se nepodařilo odeslat:",
        error
      )
    }
  }
}

/**
 * Uzamkne nástupní dokumenty i když ještě nejsou 100% hotové
 * (documentsReadinessStatus !== "READY") a pošle o tom informaci zaměstnanci
 * i HR - na rozdíl od manuálního tlačítka v okně Dokumenty
 * (`/api/nastupy/[id]/documents-lock`), které normálně vyžaduje 100 %.
 * Volá se při potvrzení skutečného nástupu, pokud to HR potvrdí v dialogu.
 */
export async function lockOnboardingDocumentsForced(args: {
  onboardingId: number
  lockedById: string | null
}): Promise<{ locked: boolean }> {
  const existing = await prisma.employeeOnboarding.findUnique({
    where: { id: args.onboardingId },
    select: {
      documentsReadinessStatus: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      userEmail: true,
      positionName: true,
      department: true,
      unitName: true,
    },
  })

  if (!existing || existing.documentsReadinessStatus === "LOCKED") {
    return { locked: false }
  }

  const now = new Date()

  const draftDocuments = await prisma.employmentDocument.findMany({
    where: {
      onboardingId: args.onboardingId,
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
    },
    select: { id: true, type: true },
  })

  await prisma.employeeOnboarding.update({
    where: { id: args.onboardingId },
    data: {
      documentsReadinessStatus: "LOCKED",
      documentsLockedAt: now,
      documentsLockedBy: args.lockedById,
    },
  })

  if (draftDocuments.length > 0) {
    await prisma.employmentDocument.updateMany({
      where: { id: { in: draftDocuments.map((document) => document.id) } },
      data: { isLocked: true },
    })
  }

  if (args.lockedById) {
    await prisma.onboardingChangeLog.create({
      data: {
        employeeId: args.onboardingId,
        userId: args.lockedById,
        action: "UPDATED",
        field: "documents_readiness",
        oldValue: existing.documentsReadinessStatus,
        newValue: "LOCKED",
      },
    })
  }

  const employeeName = [
    existing.titleBefore,
    existing.name,
    existing.surname,
    existing.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  const lockedDocumentLabels = draftDocuments.map((document) => ({
    label: typeLabel(document.type),
  }))

  if (existing.userEmail) {
    try {
      await sendEmploymentDocumentsLockedEmail({
        to: existing.userEmail,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: lockedDocumentLabels,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-LOCK] E-mail zaměstnanci se nepodařilo odeslat:",
        error
      )
    }
  }

  const hrRecipients = getHrRecipientsFromEnv()

  if (hrRecipients.length > 0) {
    try {
      await sendEmploymentDocumentsLockedHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: existing.positionName,
        employeeDepartment: existing.department,
        employeeUnitName: existing.unitName,
        documents: lockedDocumentLabels,
      })
    } catch (error) {
      console.error(
        "[ONBOARDING-DOCUMENTS-LOCK] E-mail pro HR se nepodařilo odeslat:",
        error
      )
    }
  }

  return { locked: true }
}
