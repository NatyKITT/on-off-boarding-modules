import { addDays, startOfDay } from "date-fns"

import { prisma } from "@/lib/db"
import {
  sendEmploymentDocumentExpiredHrReminderEmail,
  sendEmploymentDocumentExpiryWarningEmail,
  sendEmploymentDocumentNotSentHrReminderEmail,
  sendOnboardingReadyToLockHrReminderEmail,
  sendOnboardingStartNotConfirmedHrReminderEmail,
} from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { ONBOARDING_TYPES, typeLabel } from "@/lib/employment-documents"
import {
  getAppBaseUrlFromRequest,
  getHrRecipientsFromEnv,
} from "@/lib/probation-evaluation-request"

const WARNING_DAYS_BEFORE_EXPIRY = 3
const NOT_SENT_REMINDER_DAYS_AFTER_CREATION = 7
const REMINDER_REPEAT_EVERY_DAYS = 3

const WARNING_EVENT_MARKER =
  "Zaměstnanci bylo odesláno upozornění, že platnost odkazu k vyplnění brzy vyprší."
const HR_EXPIRED_EVENT_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že platnost odkazu vypršela a dokument stále není vyplněný."
const HR_NOT_SENT_EVENT_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že dokument stále nebyl zaslán zaměstnanci k vyplnění."
const HR_MEDICAL_EXAM_NOT_SENT_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že žádost o pracovnělékařskou prohlídku stále nebyla zaslána zaměstnanci."
const HR_START_NOT_CONFIRMED_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že zatím nepotvrdila, zda zaměstnanec skutečně nastoupil."
const HR_READY_NOT_LOCKED_MARKER =
  "Personálnímu oddělení bylo odesláno upozornění, že nástupní dokumenty jsou 100 % hotové, ale ještě nejsou označené jako dokončené."

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

type MedicalExamNotSentOnboarding = {
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

async function wasRecentlyNotified(
  documentId: number,
  marker: string,
  days: number
) {
  const since = addDays(startOfDay(new Date()), -days)

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

async function wasOnboardingRecentlyNotified(
  onboardingId: number,
  marker: string,
  days: number
) {
  const since = addDays(startOfDay(new Date()), -days)

  const existing = await prisma.onboardingChangeLog.findFirst({
    where: {
      employeeId: onboardingId,
      newValue: { startsWith: marker },
      createdAt: { gte: since },
    },
    select: { id: true },
  })

  return Boolean(existing)
}

type StartNotConfirmedOnboarding = {
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
}

type ReadyNotLockedOnboarding = StartNotConfirmedOnboarding

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

  const notSentCreatedBefore = addDays(
    today,
    -NOT_SENT_REMINDER_DAYS_AFTER_CREATION
  )

  const notSentDocuments = (await prisma.employmentDocument.findMany({
    where: {
      type: { in: ONBOARDING_TYPES },
      status: "DRAFT",
      sentAt: null,
      onboarding: {
        deletedAt: null,
        cancelledAt: null,
        createdAt: { lte: notSentCreatedBefore },
      },
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

  const medicalExamNotSent = (await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      medicalExamRequestSentAt: null,
      createdAt: { lte: notSentCreatedBefore },
      documents: {
        some: { type: "PERSONAL_QUESTIONNAIRE", completedAt: { not: null } },
      },
    },
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
  })) as MedicalExamNotSentOnboarding[]

  const startNotConfirmed = (await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      actualStart: null,
      plannedStart: { lte: today },
    },
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
  })) as StartNotConfirmedOnboarding[]

  const readyNotLocked = (await prisma.employeeOnboarding.findMany({
    where: {
      deletedAt: null,
      cancelledAt: null,
      documentsReadinessStatus: "READY",
    },
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
  })) as ReadyNotLockedOnboarding[]

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
    const notSentDocumentsByOnboarding = groupByOnboarding(notSentDocuments)
    const onboardingIds = new Set<number>([
      ...notSentDocumentsByOnboarding.keys(),
      ...medicalExamNotSent.map((onboarding) => onboarding.id),
    ])

    for (const onboardingId of onboardingIds) {
      const documents = notSentDocumentsByOnboarding.get(onboardingId) ?? []
      const toNotifyDocuments: NotSentDocument[] = []

      for (const document of documents) {
        const recentlyNotified = await wasRecentlyNotified(
          document.id,
          HR_NOT_SENT_EVENT_MARKER,
          REMINDER_REPEAT_EVERY_DAYS
        )
        if (!recentlyNotified) toNotifyDocuments.push(document)
      }

      const medicalExamOnboarding = medicalExamNotSent.find(
        (onboarding) => onboarding.id === onboardingId
      )
      const medicalExamAlreadyNotified = medicalExamOnboarding
        ? await wasOnboardingRecentlyNotified(
            onboardingId,
            HR_MEDICAL_EXAM_NOT_SENT_MARKER,
            REMINDER_REPEAT_EVERY_DAYS
          )
        : true
      const notifyMedicalExam =
        Boolean(medicalExamOnboarding) && !medicalExamAlreadyNotified

      if (!toNotifyDocuments.length && !notifyMedicalExam) continue

      const onboarding =
        toNotifyDocuments[0]?.onboarding ?? medicalExamOnboarding

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
        documents: toNotifyDocuments.map((document) => ({
          label: typeLabel(document.type),
        })),
        plannedStart: onboarding.plannedStart,
        medicalExamNotSent: notifyMedicalExam,
      })

      for (const document of toNotifyDocuments) {
        await logEmploymentDocumentEvent({
          documentId: document.id,
          action: "SENT",
          by: "system-cron",
          byName: "Systémový cron",
          message: HR_NOT_SENT_EVENT_MARKER,
        })
      }

      if (notifyMedicalExam) {
        await prisma.onboardingChangeLog.create({
          data: {
            employeeId: onboardingId,
            userId: "system-cron",
            action: "MAIL_SENT",
            field: "medical_exam_request_reminder",
            oldValue: null,
            newValue: HR_MEDICAL_EXAM_NOT_SENT_MARKER,
          },
        })
      }

      notifications.push(`hr_not_sent_sent:${onboardingId}`)
    }
  }

  if (hrRecipients.length > 0) {
    const toNotify: StartNotConfirmedOnboarding[] = []

    for (const onboarding of startNotConfirmed) {
      const recentlyNotified = await wasOnboardingRecentlyNotified(
        onboarding.id,
        HR_START_NOT_CONFIRMED_MARKER,
        REMINDER_REPEAT_EVERY_DAYS
      )
      if (!recentlyNotified) toNotify.push(onboarding)
    }

    if (toNotify.length > 0) {
      await sendOnboardingStartNotConfirmedHrReminderEmail({
        to: hrRecipients,
        records: toNotify.map((onboarding) => ({
          employeeName: buildEmployeeMeta(onboarding).fullName ?? "",
          employeePosition: onboarding.positionName,
          employeeDepartment: onboarding.department,
          plannedStart: onboarding.plannedStart,
          link: `${baseUrl}/nastupy/${onboarding.id}`,
        })),
      })

      for (const onboarding of toNotify) {
        await prisma.onboardingChangeLog.create({
          data: {
            employeeId: onboarding.id,
            userId: "system-cron",
            action: "MAIL_SENT",
            field: "start_confirmation_reminder",
            oldValue: null,
            newValue: HR_START_NOT_CONFIRMED_MARKER,
          },
        })
      }

      notifications.push(
        `start_not_confirmed_sent:${toNotify.map((o) => o.id).join(",")}`
      )
    }
  }

  if (hrRecipients.length > 0) {
    const toNotify: ReadyNotLockedOnboarding[] = []

    for (const onboarding of readyNotLocked) {
      const recentlyNotified = await wasOnboardingRecentlyNotified(
        onboarding.id,
        HR_READY_NOT_LOCKED_MARKER,
        REMINDER_REPEAT_EVERY_DAYS
      )
      if (!recentlyNotified) toNotify.push(onboarding)
    }

    if (toNotify.length > 0) {
      await sendOnboardingReadyToLockHrReminderEmail({
        to: hrRecipients,
        records: toNotify.map((onboarding) => ({
          employeeName: buildEmployeeMeta(onboarding).fullName ?? "",
          employeePosition: onboarding.positionName,
          employeeDepartment: onboarding.department,
          plannedStart: onboarding.plannedStart,
          link: `${baseUrl}/nastupy/${onboarding.id}`,
        })),
      })

      for (const onboarding of toNotify) {
        await prisma.onboardingChangeLog.create({
          data: {
            employeeId: onboarding.id,
            userId: "system-cron",
            action: "MAIL_SENT",
            field: "documents_ready_reminder",
            oldValue: null,
            newValue: HR_READY_NOT_LOCKED_MARKER,
          },
        })
      }

      notifications.push(
        `ready_not_locked_sent:${toNotify.map((o) => o.id).join(",")}`
      )
    }
  }

  return { notifications }
}
