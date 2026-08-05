import { randomBytes } from "crypto"

import type {
  PositionType,
  Prisma,
  ProbationEvaluationEventAction,
  ProbationEvaluationRequestStatus,
  ProbationEvaluationSendMethod,
  ProbationFormType,
} from "@prisma/client"
import { addDays } from "date-fns"

import {
  normalizePersonalNumber,
  pickMostRelevantOffboarding,
  shouldSkipProbationEvaluation,
} from "@/lib/employment-linking"

const managerialKeywords = [
  "vedení",
  "ředitel",
  "ředitelka",
  "vedoucí",
  "tajemník",
  "tajemnice",
]

export function normalizeProbationPositionText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function isManagerialProbationPosition(positionName?: string | null) {
  const normalizedPositionName = normalizeProbationPositionText(positionName)

  if (!normalizedPositionName) {
    return false
  }

  return managerialKeywords.some((keyword) =>
    normalizedPositionName.includes(normalizeProbationPositionText(keyword))
  )
}

function toValidDate(value?: Date | string | null) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function isManagerialByProbationDates(args?: {
  plannedStart?: Date | string | null
  actualStart?: Date | string | null
  probationEnd?: Date | string | null
}) {
  const start = toValidDate(args?.actualStart ?? args?.plannedStart ?? null)
  const end = toValidDate(args?.probationEnd ?? null)

  if (!start || !end) {
    return false
  }

  const calendarMonthDiff =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())

  return calendarMonthDiff >= 7
}

type ProbationFormTypeSource =
  | PositionType
  | null
  | undefined
  | {
      positionType?: PositionType | null
      positionName?: string | null
      plannedStart?: Date | string | null
      actualStart?: Date | string | null
      probationEnd?: Date | string | null
    }

export function getProbationFormType(
  source?: ProbationFormTypeSource
): ProbationFormType {
  if (!source || typeof source !== "object") {
    return source === "MANAGERIAL" ? "MANAGERIAL" : "REGULAR_EMPLOYEE"
  }

  if (source.positionType === "MANAGERIAL") {
    return "MANAGERIAL"
  }

  if (isManagerialProbationPosition(source.positionName)) {
    return "MANAGERIAL"
  }

  if (isManagerialByProbationDates(source)) {
    return "MANAGERIAL"
  }

  return "REGULAR_EMPLOYEE"
}

export function createProbationToken() {
  return randomBytes(32).toString("hex")
}

export function getProbationTokenExpiresAt(probationEnd?: Date | null) {
  return probationEnd
    ? addDays(new Date(probationEnd), 30)
    : addDays(new Date(), 30)
}

export function buildFullName(person: {
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
}) {
  return [person.titleBefore, person.name, person.surname, person.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function getSupervisorFullName(person: {
  supervisorTitleBefore?: string | null
  supervisorName?: string | null
  supervisorSurname?: string | null
  supervisorTitleAfter?: string | null
}) {
  return [
    person.supervisorTitleBefore,
    person.supervisorName,
    person.supervisorSurname,
    person.supervisorTitleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function getUserKey(user: {
  id?: string | null
  email?: string | null
}) {
  return user.id || user.email || "unknown"
}

export function getUserLabel(user: {
  name?: string | null
  email?: string | null
}) {
  return user.name || user.email || "Neznámý uživatel"
}

export function isAllowedEmployeeEmail(email?: string | null) {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? ""

  return domain === "praha6.cz" || domain === "kitt6.cz"
}

export function parseEmailList(value?: string) {
  return (value ?? "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter((email) => email.length > 0 && email.includes("@"))
}

export function getHrRecipientsFromEnv() {
  return Array.from(
    new Set([
      ...parseEmailList(process.env.HR_NOTIFICATION_EMAILS),
      ...parseEmailList(process.env.HR_EMAILS),
    ])
  )
}

export function getAppBaseUrlFromRequest(req: Request) {
  const origin =
    "nextUrl" in req && typeof req.nextUrl === "object"
      ? (req as { nextUrl: URL }).nextUrl.origin
      : new URL(req.url).origin

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    origin
  ).replace(/\/$/, "")
}

export function toDateIso(value?: Date | string | null) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  )
}

export async function addProbationEvent(
  tx: Prisma.TransactionClient,
  args: {
    requestId: number
    action: ProbationEvaluationEventAction
    by?: string | null
    byName?: string | null
    byEmail?: string | null
    mailQueueId?: number | null
    message?: string | null
    meta?: Prisma.InputJsonValue
  }
) {
  return tx.probationEvaluationRequestEvent.create({
    data: {
      requestId: args.requestId,
      action: args.action,
      by: args.by ?? null,
      byName: args.byName ?? null,
      byEmail: args.byEmail ?? null,
      mailQueueId: args.mailQueueId ?? null,
      message: args.message ?? null,
      meta: args.meta ?? undefined,
    },
  })
}

type ExistingProbationRequestForEnsure = {
  id: number
  status: ProbationEvaluationRequestStatus
  sentAt: Date | null
  probationEnd: Date | null
  supervisorName: string | null
  supervisorEmail: string | null
  tokenExpiresAt: Date | null
}

export async function ensureProbationEvaluationRequest(
  tx: Prisma.TransactionClient,
  args: {
    onboardingId: number
    createdBy?: string | null
    createdByName?: string | null
    // Atribuce pro CANCELLED/reaktivační event - vyplní se JEN když ensure
    // volá přímo akce člověka (STOP/KEEP rozhodnutí na odchodu). Lazy sync
    // (cron, zobrazení stránky) tyto parametry nepředává a použije se
    // obecný "system-link" popisek.
    decisionActorId?: string | null
    decisionActorName?: string | null
  }
) {
  const onboarding = await tx.employeeOnboarding.findFirst({
    where: {
      id: args.onboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
      personalNumber: true,
      positionType: true,
      positionName: true,
      plannedStart: true,
      actualStart: true,
      probationEnd: true,

      supervisorTitleBefore: true,
      supervisorName: true,
      supervisorSurname: true,
      supervisorTitleAfter: true,
      supervisorEmail: true,
    },
  })

  if (!onboarding) {
    throw new Error("Nástup nebyl nalezen.")
  }

  // TS narrow přes nested funkce neudrží, proto si po null-checku uložíme non-null alias.
  const onboardingData = onboarding

  const normalizedPersonalNumber = normalizePersonalNumber(
    onboardingData.personalNumber
  )

  const linkedOffboarding = normalizedPersonalNumber
    ? pickMostRelevantOffboarding(
        await tx.employeeOffboarding.findMany({
          where: {
            personalNumber: normalizedPersonalNumber,
            deletedAt: null,
          },
          select: {
            id: true,
            personalNumber: true,
            plannedEnd: true,
            actualEnd: true,
            probationStopDecision: true,
          },
        })
      )
    : null

  const stoppedByOffboarding = shouldSkipProbationEvaluation({
    probationEnd: onboardingData.probationEnd,
    linkedOffboarding,
  })

  const formType = getProbationFormType({
    positionType: onboardingData.positionType,
    positionName: onboardingData.positionName,
    plannedStart: onboardingData.plannedStart,
    actualStart: onboardingData.actualStart,
    probationEnd: onboardingData.probationEnd,
  })

  const supervisorName = getSupervisorFullName(onboardingData)
  const supervisorEmail = onboardingData.supervisorEmail?.trim() || null

  function getNextStatus(
    existing: ExistingProbationRequestForEnsure
  ): ProbationEvaluationRequestStatus {
    // COMPLETED je jediný stav, který se má chránit i po vypršení tokenu -
    // jednou vyplněné a podepsané hodnocení zůstává platné jako záznam.
    if (existing.status === "COMPLETED") {
      return "COMPLETED"
    }

    if (
      existing.tokenExpiresAt &&
      existing.tokenExpiresAt.getTime() < Date.now()
    ) {
      return "EXPIRED"
    }

    if (stoppedByOffboarding) {
      return "CANCELLED"
    }

    if (existing.sentAt) {
      return "SENT"
    }

    return supervisorEmail ? "READY" : "DRAFT"
  }

  async function updateExisting(existing: ExistingProbationRequestForEnsure) {
    const nextStatus = getNextStatus(existing)

    const updated = await tx.probationEvaluationRequest.update({
      where: {
        id: existing.id,
      },
      data: {
        formType,
        status: nextStatus,
        probationEnd: onboardingData.probationEnd ?? existing.probationEnd,

        // Onboarding je hlavní zdroj jména/e-mailu vedoucího.
        // Když HR změní vedoucího v nástupu, request se musí srovnat.
        supervisorName: supervisorName || null,
        supervisorEmail: supervisorEmail || null,

        tokenExpiresAt:
          existing.tokenExpiresAt ??
          getProbationTokenExpiresAt(onboardingData.probationEnd),
      },
    })

    if (nextStatus === "CANCELLED" && existing.status !== "CANCELLED") {
      await addProbationEvent(tx, {
        requestId: updated.id,
        action: "CANCELLED",
        by: args.decisionActorId ?? "system-link",
        byName: args.decisionActorName ?? "Automatické propojení s odchodem",
        message: `Hodnocení zkušební doby bylo zastaveno – propojený odchod (ID ${linkedOffboarding?.id}) spadá do zkušební doby a Personální oddělení potvrdilo zastavení hodnocení.`,
        meta: {
          linkedOffboardingId: linkedOffboarding?.id ?? null,
        },
      })
    }

    if (existing.status === "CANCELLED" && nextStatus !== "CANCELLED") {
      await addProbationEvent(tx, {
        requestId: updated.id,
        action: "UPDATED",
        by: args.decisionActorId ?? "system-link",
        byName: args.decisionActorName ?? "Automatické propojení s odchodem",
        message:
          "Hodnocení zkušební doby bylo znovu aktivováno – propojený odchod už zkušební dobu nepozastavuje.",
        meta: {
          revisionAction: "probation_reactivated",
          previousStatus: "CANCELLED",
          nextStatus,
          linkedOffboardingId: linkedOffboarding?.id ?? null,
        },
      })
    }

    if (nextStatus === "EXPIRED" && existing.status !== "EXPIRED") {
      await addProbationEvent(tx, {
        requestId: updated.id,
        action: "EXPIRED",
        by: "system-link",
        byName: "Automatická kontrola platnosti odkazu",
        message:
          "Platnost odkazu na formulář vyhodnocení zkušební doby vypršela.",
      })
    }

    return updated
  }

  const existing = await tx.probationEvaluationRequest.findUnique({
    where: {
      onboardingId: onboardingData.id,
    },
    select: {
      id: true,
      status: true,
      sentAt: true,
      probationEnd: true,
      supervisorName: true,
      supervisorEmail: true,
      tokenExpiresAt: true,
    },
  })

  if (existing) {
    const updated = await updateExisting(existing)

    return {
      request: updated,
      created: false,
    }
  }

  try {
    const initialTokenExpiresAt = getProbationTokenExpiresAt(
      onboardingData.probationEnd
    )

    const initialStatus: ProbationEvaluationRequestStatus =
      initialTokenExpiresAt.getTime() < Date.now()
        ? "EXPIRED"
        : stoppedByOffboarding
          ? "CANCELLED"
          : supervisorEmail
            ? "READY"
            : "DRAFT"

    const request = await tx.probationEvaluationRequest.create({
      data: {
        onboardingId: onboardingData.id,
        formType,
        status: initialStatus,
        token: createProbationToken(),
        tokenExpiresAt: initialTokenExpiresAt,
        probationEnd: onboardingData.probationEnd ?? null,
        supervisorName: supervisorName || null,
        supervisorEmail,
        createdBy: args.createdBy ?? null,
        createdByName: args.createdByName ?? null,
        data: {},
      },
    })

    await addProbationEvent(tx, {
      requestId: request.id,
      action: "CREATED",
      by: args.createdBy,
      byName: args.createdByName,
      message: "Byl vytvořen formulář vyhodnocení zkušební doby.",
      meta: {
        formType,
        positionType: onboardingData.positionType,
        positionName: onboardingData.positionName,
        probationEnd: toDateIso(onboardingData.probationEnd),
        supervisorName: supervisorName || null,
        supervisorEmail,
      },
    })

    if (initialStatus === "CANCELLED") {
      await addProbationEvent(tx, {
        requestId: request.id,
        action: "CANCELLED",
        by: args.decisionActorId ?? "system-link",
        byName: args.decisionActorName ?? "Automatické propojení s odchodem",
        message: `Hodnocení zkušební doby bylo rovnou zastaveno – propojený odchod (ID ${linkedOffboarding?.id}) spadá do zkušební doby a Personální oddělení potvrdilo zastavení hodnocení.`,
        meta: {
          linkedOffboardingId: linkedOffboarding?.id ?? null,
        },
      })
    }

    return {
      request,
      created: true,
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error
    }

    const racedExisting = await tx.probationEvaluationRequest.findUnique({
      where: {
        onboardingId: onboardingData.id,
      },
      select: {
        id: true,
        status: true,
        sentAt: true,
        probationEnd: true,
        supervisorName: true,
        supervisorEmail: true,
        tokenExpiresAt: true,
      },
    })

    if (!racedExisting) {
      throw error
    }

    const updated = await updateExisting(racedExisting)

    return {
      request: updated,
      created: false,
    }
  }
}

/**
 * Přepočítá navázané ProbationEvaluationRequest po tom, co se na odchodu
 * změnilo probationStopDecision (nové STOP/KEEP rozhodnutí, revert, smazání
 * nebo obnova odchodu). Zapíše i zrcadlový OnboardingChangeLog záznam, ať je
 * změna stavu vidět v běžné historii nástupu, ne jen v eventech hodnocení.
 */
export async function syncLinkedProbationAfterOffboardingDecision(
  tx: Prisma.TransactionClient,
  args: {
    onboardingId: number
    actorId: string
    actorName: string
  }
) {
  const existingRequest = await tx.probationEvaluationRequest.findUnique({
    where: { onboardingId: args.onboardingId },
    select: { status: true },
  })

  const ensured = await ensureProbationEvaluationRequest(tx, {
    onboardingId: args.onboardingId,
    createdBy: args.actorId,
    createdByName: args.actorName,
    decisionActorId: args.actorId,
    decisionActorName: args.actorName,
  })

  if (!existingRequest || existingRequest.status !== ensured.request.status) {
    await tx.onboardingChangeLog.create({
      data: {
        employeeId: args.onboardingId,
        userId: args.actorId,
        action: "STATUS_CHANGED",
        field: "probationEvaluationStatus",
        oldValue: existingRequest?.status ?? null,
        newValue: ensured.request.status,
      },
    })
  }

  return ensured
}

type SerializableProbationEvent = {
  id: number
  action: string
  message: string | null
  byName: string | null
  byEmail: string | null
  mailQueueId?: number | null
  createdAt: Date
}

type SerializableProbationEvaluation = {
  id: number
  evaluatorName: string
  evaluatorEmail: string
  recommendation: boolean
  evaluatedAt: Date
  status: string
  lastEditedAt: Date | null
  lastEditedByName: string | null
  lastEditedByEmail: string | null
}

type SerializableProbationRequest = {
  id: number
  onboardingId: number
  status: ProbationEvaluationRequestStatus
  formType: ProbationFormType
  token: string
  tokenExpiresAt: Date | null
  probationEnd: Date | null
  isLocked: boolean

  supervisorName: string | null
  supervisorEmail: string | null

  sentAt: Date | null
  sentBy: string | null
  sentByName: string | null
  sentMethod: ProbationEvaluationSendMethod | null

  hrInfoSentAt: Date | null
  hrInfoSentBy: string | null

  missingSupervisorNotifiedAt: Date | null
  missingSupervisorNotifiedBy: string | null

  lastReminderAt: Date | null
  lastReminderBy: string | null
  lastReminderByName: string | null
  reminderCount: number

  hrReminderBeforeEndSentAt: Date | null
  hrReminderBeforeEndSentBy: string | null

  completedAt: Date | null
  completedBy: string | null
  completedByName: string | null
  completedByEmail: string | null
  completedNotificationSentAt: Date | null
  completedNotificationSentBy: string | null

  tajemnikRequired: boolean

  resetAt: Date | null
  resetBy: string | null
  resetByName: string | null

  createdBy: string | null
  createdByName: string | null

  data?: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date

  evaluations?: SerializableProbationEvaluation[]
  events?: SerializableProbationEvent[]
}

export function serializeProbationRequest(
  request: SerializableProbationRequest
) {
  const data = asJsonObject(request.data)
  const latestEvaluation = request.evaluations?.[0] ?? null
  const isFinalData =
    request.status === "COMPLETED" ||
    data.submitMode === "final" ||
    data.submitMode === "revision"

  return {
    id: request.id,
    onboardingId: request.onboardingId,
    status: request.status,
    formType: request.formType,
    token: request.token,
    tokenExpiresAt: toDateIso(request.tokenExpiresAt),
    probationEnd: toDateIso(request.probationEnd),
    isLocked: request.isLocked,

    supervisorName: request.supervisorName,
    supervisorEmail: request.supervisorEmail,

    sentAt: toDateIso(request.sentAt),
    sentBy: request.sentBy,
    sentByName: request.sentByName,
    sentByEmail: null,
    sentMethod: request.sentMethod,

    hrInfoSentAt: toDateIso(request.hrInfoSentAt),
    hrInfoSentBy: request.hrInfoSentBy,

    missingSupervisorNotifiedAt: toDateIso(request.missingSupervisorNotifiedAt),
    missingSupervisorNotifiedBy: request.missingSupervisorNotifiedBy,

    lastReminderAt: toDateIso(request.lastReminderAt),
    lastReminderBy: request.lastReminderBy,
    lastReminderByName: request.lastReminderByName,
    lastReminderByEmail: null,
    reminderCount: request.reminderCount,

    hrReminderBeforeEndSentAt: toDateIso(request.hrReminderBeforeEndSentAt),
    hrReminderBeforeEndSentBy: request.hrReminderBeforeEndSentBy,

    completedAt: toDateIso(request.completedAt),
    completedBy: request.completedBy,
    completedByName: request.completedByName,
    completedByEmail: request.completedByEmail,

    completedNotificationSentAt: toDateIso(request.completedNotificationSentAt),
    completedNotificationSentBy: request.completedNotificationSentBy,

    tajemnikRequired: request.tajemnikRequired,

    resetAt: toDateIso(request.resetAt),
    resetBy: request.resetBy,
    resetByName: request.resetByName,

    createdBy: request.createdBy,
    createdByName: request.createdByName,

    submitMode: asStringOrNull(data.submitMode),

    evaluatorName:
      latestEvaluation?.evaluatorName ?? asStringOrNull(data.evaluatorName),
    evaluatorEmail:
      latestEvaluation?.evaluatorEmail ?? asStringOrNull(data.evaluatorEmail),

    evaluatorPosition: asStringOrNull(data.evaluatorPosition),
    evaluatorDepartment: asStringOrNull(data.evaluatorDepartment),
    evaluatorUnitName: asStringOrNull(data.evaluatorUnitName),

    supervisorPosition: null,
    supervisorDepartment: null,
    supervisorUnitName: null,

    recommendation:
      latestEvaluation?.recommendation ??
      (isFinalData
        ? data.recommendation === "yes"
          ? true
          : data.recommendation === "no"
            ? false
            : null
        : null),

    evaluatedAt: latestEvaluation
      ? latestEvaluation.evaluatedAt.toISOString()
      : isFinalData
        ? asStringOrNull(data.evaluatedAt)
        : null,

    lastEditedAt: toDateIso(latestEvaluation?.lastEditedAt ?? null),
    lastEditedByName: latestEvaluation?.lastEditedByName ?? null,
    lastEditedByEmail: latestEvaluation?.lastEditedByEmail ?? null,

    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    data,

    events:
      request.events?.map((event) => ({
        id: event.id,
        action: event.action,
        message: event.message,
        byName: event.byName,
        byEmail: event.byEmail,
        mailQueueId: event.mailQueueId ?? null,
        createdAt: event.createdAt.toISOString(),
      })) ?? [],
  }
}
