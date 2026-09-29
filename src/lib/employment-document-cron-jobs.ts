import { addDays, startOfDay } from "date-fns"

import { prisma } from "@/lib/db"
import {
  sendEmploymentDocumentExpiredHrReminderEmail,
  sendEmploymentDocumentExpiryWarningEmail,
  sendEmploymentDocumentNotSentHrReminderEmail,
} from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import {
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
} from "@/lib/probation-evaluation-request"

const WARNING_DAYS_BEFORE_EXPIRY = 3
const NOT_SENT_REMINDER_DAYS_BEFORE_START = 3

const WARNING_EVENT_MARKER =
  "Zaměstnanci bylo odesláno upozornění, že platnost odkazu k vyplnění brzy vyprší."
const HR_EXPIRED_EVENT_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že platnost odkazu vypršela a dokument stále není vyplněný."
const HR_NOT_SENT_EVENT_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že dokument stále nebyl zaslán zaměstnanci k vyplnění."

type PendingDocument = {
  id: number
  type: (typeof ONBOARDING_TYPES)[number]
  accessHash: string
  expiresAt: Date
  onboardingId: number
  onboarding: {
    id: number
    titleBefore: string | null
    name: string
    surname: string
    titleAfter: string | null
    personalNumber: string | null
    department: string
    unitName: string
    positionName: string
    email: string | null
  } | null
}

type NotSentDocument = {
  id: number
  type: (typeof ONBOARDING_TYPES)[number]
  onboardingId: number
  onboarding: {
    id: number
    titleBefore: string | null
    name: string
    surname: string
    titleAfter: string | null
    personalNumber: string | null
    department: string
    unitName: string
    positionName: string
    plannedStart: Date
  } | null
}

function groupByOnboarding<T extends { onboardingId: number }>(documents: T[]) {
  const map = new Map<number, T[]>()

  for (const document of documents) {
    const list = map.get(document.onboardingId) ?? []
    list.push(document)
    map.set(document.onboardingId, list)
  }

  return map
}

async function getCurrentCycleStart(documentId: number): Promise<Date> {
  const event = await prisma.employmentDocumentEvent.findFirst({
    where: { documentId, action: { in: ["CREATED", "REGENERATED"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })

  return event?.createdAt ?? new Date(0)
}

async function wasAlreadyNotified(documentId: number, marker: string) {
  const since = await getCurrentCycleStart(documentId)

  const existing = await prisma.employmentDocumentEvent.findFirst({
    where: {
      documentId,
      message: { startsWith: marker },
      createdAt: { gte: since },
    },
    select: { id: true },
  })

  return Boolean(existing)
}

export async function ensureEmploymentDocumentReminders(req: Request) {
  const now = new Date()
  const today = startOfDay(now)
  const warningWindowStart = addDays(today, WARNING_DAYS_BEFORE_EXPIRY)
  const warningWindowEnd = addDays(today, WARNING_DAYS_BEFORE_EXPIRY + 1)

  const baseUrl = getAppBaseUrlFromRequest(req)
  const hrRecipients = getHrRecipientsFromEnv()

  const notifications: string[] = []

  const pendingDocuments = (await prisma.employmentDocument.findMany({
    where: {
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
      isLocked: false,
      sentAt: { not: null },
      expiresAt: { not: null },
      onboarding: { deletedAt: null },
    },
    select: {
      id: true,
      type: true,
      accessHash: true,
      expiresAt: true,
      onboardingId: true,
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          personalNumber: true,
          department: true,
          unitName: true,
          positionName: true,
          email: true,
        },
      },
    },
  })) as PendingDocument[]

  const dueForWarning = pendingDocuments.filter(
    (document) =>
      document.expiresAt >= warningWindowStart &&
      document.expiresAt < warningWindowEnd
  )

  const dueForHrExpired = pendingDocuments.filter(
    (document) => document.expiresAt < now
  )

  const notSentWindowEnd = addDays(today, NOT_SENT_REMINDER_DAYS_BEFORE_START)

  const notSentDocuments = (await prisma.employmentDocument.findMany({
    where: {
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
      sentAt: null,
      onboarding: { deletedAt: null, plannedStart: { lt: notSentWindowEnd } },
    },
    select: {
      id: true,
      type: true,
      onboardingId: true,
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          personalNumber: true,
          department: true,
          unitName: true,
          positionName: true,
          plannedStart: true,
        },
      },
    },
  })) as NotSentDocument[]

  for (const [onboardingId, documents] of groupByOnboarding(dueForWarning)) {
    const toNotify: PendingDocument[] = []

    for (const document of documents) {
      const alreadyNotified = await wasAlreadyNotified(
        document.id,
        WARNING_EVENT_MARKER
      )
      if (!alreadyNotified) toNotify.push(document)
    }

    if (!toNotify.length) continue

    const onboarding = toNotify[0].onboarding
    const email = onboarding?.email?.trim()

    if (!onboarding || !email) {
      notifications.push(`expiry_warning_skipped_no_email:${onboardingId}`)
      continue
    }

    const meta = buildEmployeeMeta(onboarding)

    await sendEmploymentDocumentExpiryWarningEmail({
      to: email,
      employeeName: meta.fullName ?? "",
      employeePersonalNumber: onboarding.personalNumber,
      employeePosition: meta.position,
      employeeDepartment: meta.department,
      employeeUnitName: meta.unitName,
      documents: toNotify.map((document) => ({
        label: typeLabel(document.type),
        url: `${baseUrl}/dokumenty/${document.accessHash}`,
      })),
      expiresAt: toNotify[0].expiresAt,
    })

    for (const document of toNotify) {
      await logEmploymentDocumentEvent({
        documentId: document.id,
        action: "SENT",
        by: "system-cron",
        byName: "Systémový cron",
        byEmail: email,
        message: WARNING_EVENT_MARKER,
      })
    }

    notifications.push(`expiry_warning_sent:${onboardingId}`)
  }

  if (hrRecipients.length > 0) {
    for (const [onboardingId, documents] of groupByOnboarding(
      dueForHrExpired
    )) {
      const toNotify: PendingDocument[] = []

      for (const document of documents) {
        const alreadyNotified = await wasAlreadyNotified(
          document.id,
          HR_EXPIRED_EVENT_MARKER
        )
        if (!alreadyNotified) toNotify.push(document)
      }

      if (!toNotify.length) continue

      const onboarding = toNotify[0].onboarding

      if (!onboarding) {
        notifications.push(`hr_expired_skipped_no_onboarding:${onboardingId}`)
        continue
      }

      const meta = buildEmployeeMeta(onboarding)

      await sendEmploymentDocumentExpiredHrReminderEmail({
        to: hrRecipients,
        employeeName: meta.fullName ?? "",
        employeePersonalNumber: onboarding.personalNumber,
        employeePosition: meta.position,
        employeeDepartment: meta.department,
        employeeUnitName: meta.unitName,
        documents: toNotify.map((document) => ({
          label: typeLabel(document.type),
          url: `${baseUrl}/dokumenty/${document.accessHash}`,
        })),
      })

      for (const document of toNotify) {
        await logEmploymentDocumentEvent({
          documentId: document.id,
          action: "SENT",
          by: "system-cron",
          byName: "Systémový cron",
          message: HR_EXPIRED_EVENT_MARKER,
        })
      }

      notifications.push(`hr_expired_sent:${onboardingId}`)
    }
  }

  if (hrRecipients.length > 0) {
    for (const [onboardingId, documents] of groupByOnboarding(
      notSentDocuments
    )) {
      const toNotify: NotSentDocument[] = []

      for (const document of documents) {
        const alreadyNotified = await wasAlreadyNotified(
          document.id,
          HR_NOT_SENT_EVENT_MARKER
        )
        if (!alreadyNotified) toNotify.push(document)
      }

      if (!toNotify.length) continue

      const onboarding = toNotify[0].onboarding

      if (!onboarding) {
        notifications.push(`hr_not_sent_skipped_no_onboarding:${onboardingId}`)
        continue
      }

      const meta = buildEmployeeMeta(onboarding)

      await sendEmploymentDocumentNotSentHrReminderEmail({
        to: hrRecipients,
        employeeName: meta.fullName ?? "",
        employeePersonalNumber: onboarding.personalNumber,
        employeePosition: meta.position,
        employeeDepartment: meta.department,
        employeeUnitName: meta.unitName,
        documents: toNotify.map((document) => ({
          label: typeLabel(document.type),
        })),
        plannedStart: onboarding.plannedStart,
      })

      for (const document of toNotify) {
        await logEmploymentDocumentEvent({
          documentId: document.id,
          action: "SENT",
          by: "system-cron",
          byName: "Systémový cron",
          message: HR_NOT_SENT_EVENT_MARKER,
        })
      }

      notifications.push(`hr_not_sent_sent:${onboardingId}`)
    }
  }

  return { notifications }
}
