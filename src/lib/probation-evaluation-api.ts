import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import {
  Prisma,
  ProbationEvaluationRequestStatus,
  ProbationEvaluationStatus,
} from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  genderedPastVerb,
  sendProbationEvaluationPdfEmail,
  sendProbationEvaluationTajemnikReviewRequestEmail,
  sendTajemnikReviewCompletedToSupervisorEmail,
} from "@/lib/email"
import {
  buildLinkedOffboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOffboarding,
} from "@/lib/employment-linking"
import { getEmployees, type Employee } from "@/lib/eos-employees"
import { buildPersonFullName } from "@/lib/person-snapshot"
import { renderProbationEvaluationPdfBuffer } from "@/lib/probation-evaluation-pdf"
import {
  addProbationEvent,
  buildFullName,
  ensureProbationEvaluationRequest,
  getHrRecipientsFromEnv,
  getUserKey,
  getUserLabel,
  isAllowedEmployeeEmail,
  serializeProbationRequest,
  toDateIso,
} from "@/lib/probation-evaluation-request"
import { resolveTajemnik } from "@/lib/systemizace-superior"

export type CurrentUser = {
  id?: string | null
  name?: string | null
  email?: string | null
  role?: string | null
}

export type ProbationRevisionRecord = {
  open?: boolean | null
  openedAt?: string | null
  openedByName?: string | null
  openedByEmail?: string | null
  editedAt?: string | null
  editedByName?: string | null
  editedByEmail?: string | null
  count?: number | null
}

type SupervisorMeta = {
  supervisorName: string | null
  supervisorEmail: string | null
  supervisorPosition: string | null
  supervisorDepartment: string | null
  supervisorUnitName: string | null
}

export const probationSignatureSchema = z.object({
  signedByName: z.string().nullable().optional(),
  signedByEmail: z.string().nullable().optional(),
  signedAt: z.string().nullable().optional(),
  signedOnBehalf: z.boolean().nullable().optional(),
})

export const probationSaveSchema = z
  .object({
    submitMode: z
      .enum(["draft", "final", "revision", "tajemnik"])
      .default("draft"),

    workResults: z.string().trim().optional().default(""),
    workBehavior: z.string().trim().optional().default(""),
    socialSkills: z.string().trim().optional().default(""),
    skillsKnowledgeTraits: z.string().trim().optional().default(""),

    workPerformance: z.string().trim().optional(),
    socialBehavior: z.string().trim().optional(),

    recommendation: z
      .union([z.enum(["yes", "no"]), z.literal("")])
      .optional()
      .default(""),
    reason: z.string().trim().optional(),
    reasonIfNo: z.string().trim().optional(),

    evaluatorName: z.string().trim().optional(),
    evaluatorEmail: z.string().trim().optional(),
    evaluatorPosition: z.string().trim().nullable().optional(),
    evaluatorDepartment: z.string().trim().nullable().optional(),
    evaluatorUnitName: z.string().trim().nullable().optional(),

    signature: probationSignatureSchema.optional().default({}),

    tajemnikAgreement: z
      .union([z.enum(["yes", "no"]), z.literal("")])
      .optional()
      .default(""),
    tajemnikComment: z.string().trim().optional(),
    tajemnikSignature: probationSignatureSchema.optional().default({}),
  })
  .superRefine((values, ctx) => {
    if (values.submitMode === "draft") return

    if (values.submitMode === "tajemnik") {
      if (
        values.tajemnikAgreement !== "yes" &&
        values.tajemnikAgreement !== "no"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tajemnikAgreement"],
          message: "Vyberte, zda s doporučením souhlasíte.",
        })
      }

      if (!values.tajemnikSignature?.signedAt?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tajemnikSignature"],
          message: "Před odesláním je potřeba se podepsat.",
        })
      }

      return
    }

    if (values.workResults.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workResults"],
        message: "Vyplňte pracovní výsledky alespoň stručně.",
      })
    }

    if (values.workBehavior.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workBehavior"],
        message: "Vyplňte pracovní chování alespoň stručně.",
      })
    }

    if (values.socialSkills.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["socialSkills"],
        message: "Vyplňte sociální chování a spolupráci alespoň stručně.",
      })
    }

    if (values.skillsKnowledgeTraits.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skillsKnowledgeTraits"],
        message: "Vyplňte dovednosti, znalosti a vlastnosti alespoň stručně.",
      })
    }

    if (values.recommendation !== "yes" && values.recommendation !== "no") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendation"],
        message: "Vyberte doporučení.",
      })
    }

    if (values.recommendation === "no" && !values.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "U záporného stanoviska je důvod povinný.",
      })
    }

    if (!values.signature?.signedAt?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signature"],
        message: "Před finálním uložením je potřeba formulář podepsat.",
      })
    }
  })

export type ProbationSaveInput = z.infer<typeof probationSaveSchema>

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ status: "error", message }, { status })
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase()
}

export function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export function getProbationRevisionRecord(
  value: unknown
): ProbationRevisionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as ProbationRevisionRecord
}

export function isProbationRevisionOpen(data: unknown) {
  const existingData = getJsonRecord(data)
  const revision = getProbationRevisionRecord(existingData.revision)

  return revision.open === true
}

export type TajemnikReview = {
  agreement?: "yes" | "no" | null
  comment?: string | null
  signedByName?: string | null
  signedByEmail?: string | null
  signedAt?: string | null
  reviewedAt?: string | null
}

export function getTajemnikReview(data: unknown): TajemnikReview {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {}

  return data as TajemnikReview
}

export function getNumericId(value: string) {
  const id = Number(value)

  return Number.isFinite(id) ? id : null
}

export function getAppBaseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    req.nextUrl.origin
  ).replace(/\/$/, "")
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function canReadInternalProbation(role?: string | null) {
  return ["ADMIN", "HR", "IT"].includes(role ?? "")
}

export function canManageInternalProbation(role?: string | null) {
  return ["ADMIN", "HR", "IT"].includes(role ?? "")
}

export function canSendInternalProbation(role?: string | null) {
  return ["ADMIN", "HR", "IT"].includes(role ?? "")
}

export function canSaveInternalProbation(role?: string | null) {
  return ["ADMIN", "HR", "IT"].includes(role ?? "")
}

export async function requireInternalProbationRead() {
  const session = await auth()
  const user = session?.user as CurrentUser | undefined

  if (!user) {
    return {
      ok: false as const,
      response: jsonError("Nejste přihlášen(a).", 401),
    }
  }

  if (!canReadInternalProbation(user.role)) {
    return {
      ok: false as const,
      response: jsonError(
        "Nemáte oprávnění zobrazit vyhodnocení zkušební doby.",
        403
      ),
    }
  }

  return { ok: true as const, user }
}

export async function requireInternalProbationManage() {
  const session = await auth()
  const user = session?.user as CurrentUser | undefined

  if (!user) {
    return {
      ok: false as const,
      response: jsonError("Nejste přihlášen(a).", 401),
    }
  }

  if (!canManageInternalProbation(user.role)) {
    return {
      ok: false as const,
      response: jsonError(
        "Nemáte oprávnění upravovat vyhodnocení zkušební doby.",
        403
      ),
    }
  }

  return { ok: true as const, user }
}

export async function requireInternalProbationSend() {
  const session = await auth()
  const user = session?.user as CurrentUser | undefined

  if (!user) {
    return {
      ok: false as const,
      response: jsonError("Nejste přihlášen(a).", 401),
    }
  }

  if (!canSendInternalProbation(user.role)) {
    return {
      ok: false as const,
      response: jsonError(
        "Nemáte oprávnění odesílat PDF vyhodnocení zkušební doby.",
        403
      ),
    }
  }

  return { ok: true as const, user }
}

export async function requireInternalProbationSave() {
  const session = await auth()
  const user = session?.user as CurrentUser | undefined

  if (!user) {
    return {
      ok: false as const,
      response: jsonError("Nejste přihlášen(a).", 401),
    }
  }

  if (!canSaveInternalProbation(user.role)) {
    return {
      ok: false as const,
      response: jsonError(
        "Nemáte oprávnění ukládat vyhodnocení zkušební doby.",
        403
      ),
    }
  }

  return { ok: true as const, user }
}

export async function requirePublicProbationAccess() {
  const session = await auth()
  const user = session?.user as CurrentUser | undefined

  if (!user?.email) {
    return {
      ok: false as const,
      response: jsonError("Nejste přihlášen(a).", 401),
    }
  }

  if (!isAllowedEmployeeEmail(user.email)) {
    return {
      ok: false as const,
      response: jsonError("Nemáte oprávněný přístup k této stránce.", 403),
    }
  }

  return { ok: true as const, user }
}

export async function getProbationDetailByOnboardingId(onboardingId: number) {
  return prisma.probationEvaluationRequest.findUnique({
    where: { onboardingId },
    include: {
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          personalNumber: true,
          positionName: true,
          positionType: true,
          department: true,
          unitName: true,
          plannedStart: true,
          actualStart: true,
          probationEnd: true,
          supervisorTitleBefore: true,
          supervisorName: true,
          supervisorSurname: true,
          supervisorTitleAfter: true,
          supervisorEmail: true,
          supervisorPosition: true,
          supervisorDepartment: true,
          supervisorUnitName: true,
          supervisorPersonalNumber: true,
          deletedAt: true,
        },
      },
      evaluations: {
        where: {
          status: ProbationEvaluationStatus.ACTIVE,
        },
        orderBy: {
          evaluatedAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          evaluatorName: true,
          evaluatorEmail: true,
          recommendation: true,
          evaluatedAt: true,
          status: true,
          lastEditedAt: true,
          lastEditedByName: true,
          lastEditedByEmail: true,
        },
      },
      events: {
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
        select: {
          id: true,
          action: true,
          message: true,
          byName: true,
          byEmail: true,
          mailQueueId: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function getProbationDetailByToken(token: string) {
  return prisma.probationEvaluationRequest.findUnique({
    where: { token },
    include: {
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          personalNumber: true,
          positionName: true,
          positionType: true,
          department: true,
          unitName: true,
          plannedStart: true,
          actualStart: true,
          probationEnd: true,
          supervisorTitleBefore: true,
          supervisorName: true,
          supervisorSurname: true,
          supervisorTitleAfter: true,
          supervisorEmail: true,
          supervisorPosition: true,
          supervisorDepartment: true,
          supervisorUnitName: true,
          supervisorPersonalNumber: true,
          deletedAt: true,
        },
      },
      evaluations: {
        where: {
          status: ProbationEvaluationStatus.ACTIVE,
        },
        orderBy: {
          evaluatedAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          evaluatorName: true,
          evaluatorEmail: true,
          recommendation: true,
          evaluatedAt: true,
          status: true,
          lastEditedAt: true,
          lastEditedByName: true,
          lastEditedByEmail: true,
        },
      },
      events: {
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
        select: {
          id: true,
          action: true,
          message: true,
          byName: true,
          byEmail: true,
          mailQueueId: true,
          createdAt: true,
        },
      },
    },
  })
}

export type ProbationDetail = NonNullable<
  Awaited<ReturnType<typeof getProbationDetailByOnboardingId>>
>

export type PublicProbationDetail = NonNullable<
  Awaited<ReturnType<typeof getProbationDetailByToken>>
>

export async function getOrEnsureProbationDetail(args: {
  onboardingId: number
  user: CurrentUser
}) {
  await prisma.$transaction(async (tx) => {
    await ensureProbationEvaluationRequest(tx, {
      onboardingId: args.onboardingId,
      createdBy: getUserKey({
        id: args.user.id,
        email: args.user.email,
      }),
      createdByName: getUserLabel({
        name: args.user.name,
        email: args.user.email,
      }),
    })
  })

  return getProbationDetailByOnboardingId(args.onboardingId)
}

function buildLegacyBlock(
  titleA: string,
  valueA: string,
  titleB: string,
  valueB: string
) {
  return [`${titleA}:\n${valueA}`, `${titleB}:\n${valueB}`].join("\n\n")
}

function getWorkPerformance(parsed: ProbationSaveInput) {
  return (
    parsed.workPerformance?.trim() ||
    buildLegacyBlock(
      "Pracovní výsledky",
      parsed.workResults.trim(),
      "Pracovní chování",
      parsed.workBehavior.trim()
    )
  )
}

function getSocialBehavior(parsed: ProbationSaveInput) {
  return (
    parsed.socialBehavior?.trim() ||
    buildLegacyBlock(
      "Sociální chování a spolupráce",
      parsed.socialSkills.trim(),
      "Dovednosti, znalosti a vlastnosti",
      parsed.skillsKnowledgeTraits.trim()
    )
  )
}

function normalizeCompare(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim()
}

function stripCommonTitles(value?: string | null) {
  return (value ?? "")
    .replace(/\b(ing|mgr|bc|mudr|judr|phdr|rndr|doc|prof|mba|dis)\.?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function getLastNameFromDisplayName(value?: string | null) {
  const withoutTitles = stripCommonTitles(value)
  const parts = withoutTitles
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length > 0 ? parts[parts.length - 1] : ""
}

function buildSupervisorFullName(onboarding: ProbationDetail["onboarding"]) {
  return [
    onboarding.supervisorTitleBefore,
    onboarding.supervisorName,
    onboarding.supervisorSurname,
    onboarding.supervisorTitleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildEmployeeFullName(employee: Employee) {
  return [
    employee.titleBefore,
    employee.name,
    employee.surname,
    employee.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildEmployeePlainName(employee: Employee) {
  return [employee.name, employee.surname]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function getEmployeePosition(employee: Employee) {
  const withOptionalPosition = employee as Employee & {
    position?: string | null
  }

  return (
    cleanText(employee.positionName) ||
    cleanText(withOptionalPosition.position) ||
    null
  )
}

function buildSupervisorLookupQueries(args: {
  supervisorName?: string | null
  supervisorEmail?: string | null
}) {
  const supervisorName = cleanText(args.supervisorName)
  const nameWithoutTitles = stripCommonTitles(supervisorName)
  const lastName = getLastNameFromDisplayName(supervisorName)
  const supervisorEmail = cleanEmail(args.supervisorEmail)

  return Array.from(
    new Set(
      [supervisorName, nameWithoutTitles, lastName, supervisorEmail]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  )
}

function pickSupervisorEmployee(
  employees: Employee[],
  args: {
    supervisorName?: string | null
    supervisorEmail?: string | null
  }
) {
  const supervisorName = cleanText(args.supervisorName)
  const normalizedName = normalizeCompare(supervisorName)
  const normalizedNameWithoutTitles = normalizeCompare(
    stripCommonTitles(supervisorName)
  )
  const supervisorEmail = cleanEmail(args.supervisorEmail)

  const byExactPlainName = employees.find(
    (employee) =>
      normalizeCompare(buildEmployeePlainName(employee)) ===
      normalizedNameWithoutTitles
  )

  if (byExactPlainName) return byExactPlainName

  const byExactFullName = employees.find((employee) => {
    const fullName = normalizeCompare(buildEmployeeFullName(employee))

    return (
      fullName === normalizedName || fullName === normalizedNameWithoutTitles
    )
  })

  if (byExactFullName) return byExactFullName

  const byEmail = supervisorEmail
    ? employees.find(
        (employee) => cleanEmail(employee.email) === supervisorEmail
      )
    : null

  if (byEmail) return byEmail

  if (employees.length === 1) return employees[0]

  return null
}

function samePersonBySavedEvaluatorData(args: {
  supervisorName?: string | null
  supervisorEmail?: string | null
  evaluatorName?: unknown
  evaluatorEmail?: unknown
}) {
  const supervisorName = normalizeCompare(args.supervisorName)
  const supervisorEmail = cleanEmail(args.supervisorEmail)
  const evaluatorName = normalizeCompare(
    typeof args.evaluatorName === "string" ? args.evaluatorName : null
  )
  const evaluatorEmail = cleanEmail(
    typeof args.evaluatorEmail === "string" ? args.evaluatorEmail : null
  )

  if (supervisorEmail && evaluatorEmail && supervisorEmail === evaluatorEmail) {
    return true
  }

  if (supervisorName && evaluatorName && supervisorName === evaluatorName) {
    return true
  }

  if (
    supervisorName &&
    evaluatorName &&
    normalizeCompare(stripCommonTitles(supervisorName)) ===
      normalizeCompare(stripCommonTitles(evaluatorName))
  ) {
    return true
  }

  return false
}

function isSameTajemnikPerson(args: {
  tajemnikName: string | null
  tajemnikEmail: string | null
  candidateName?: string | null
  candidateEmail?: string | null
}): boolean {
  const tajemnikEmail = cleanEmail(args.tajemnikEmail)
  const candidateEmail = cleanEmail(args.candidateEmail)

  if (!tajemnikEmail || !candidateEmail || tajemnikEmail !== candidateEmail) {
    return false
  }

  const tajemnikName = normalizeCompare(stripCommonTitles(args.tajemnikName))
  const candidateName = normalizeCompare(stripCommonTitles(args.candidateName))

  return Boolean(
    tajemnikName && candidateName && tajemnikName === candidateName
  )
}

function supervisorBaseMeta(
  request: ProbationDetail | PublicProbationDetail
): SupervisorMeta {
  const onboarding = request.onboarding
  const data = getJsonRecord(request.data)
  const supervisorFullName = buildSupervisorFullName(onboarding)

  const supervisorName =
    supervisorFullName ||
    cleanText(request.supervisorName) ||
    cleanText(data.evaluatorName) ||
    null

  const supervisorEmail =
    cleanEmail(onboarding.supervisorEmail) ||
    cleanEmail(request.supervisorEmail) ||
    cleanEmail(data.evaluatorEmail) ||
    null

  return {
    // Onboarding/request jsou hlavní zdroj jména a e-mailu. EOS lookup je nesmí přepsat.
    supervisorName,
    supervisorEmail,

    // Org data bereme nejdřív ze snapshotu v nástupu. Pokud chybí, doplní je buildResolvedSupervisorMeta přes EOS.
    supervisorPosition: cleanText(onboarding.supervisorPosition) || null,
    supervisorDepartment: cleanText(onboarding.supervisorDepartment) || null,
    supervisorUnitName: cleanText(onboarding.supervisorUnitName) || null,
  }
}

async function resolveSupervisorFromEmployees(args: {
  supervisorName?: string | null
  supervisorEmail?: string | null
}): Promise<SupervisorMeta | null> {
  const queries = buildSupervisorLookupQueries(args)

  if (queries.length === 0) return null

  try {
    for (const query of queries) {
      const employees = await getEmployees(query)

      const employee = pickSupervisorEmployee(employees, {
        supervisorName: args.supervisorName,
        supervisorEmail: args.supervisorEmail,
      })

      if (!employee) continue

      const resolvedName =
        buildEmployeeFullName(employee) || buildEmployeePlainName(employee)

      return {
        supervisorName: resolvedName || cleanText(args.supervisorName) || null,
        supervisorEmail:
          cleanEmail(employee.email) ||
          cleanEmail(args.supervisorEmail) ||
          null,
        supervisorPosition: getEmployeePosition(employee),
        supervisorDepartment: cleanText(employee.department) || null,
        supervisorUnitName: cleanText(employee.unitName) || null,
      }
    }

    return null
  } catch (error) {
    console.error("[PROBATION SUPERVISOR EOS LOOKUP]", error)
    return null
  }
}

async function buildResolvedSupervisorMeta(
  request: ProbationDetail | PublicProbationDetail
): Promise<SupervisorMeta> {
  const base = supervisorBaseMeta(request)
  const data = getJsonRecord(request.data)

  const hasAllOrgData = Boolean(
    base.supervisorPosition &&
      base.supervisorDepartment &&
      base.supervisorUnitName
  )

  const resolved = hasAllOrgData
    ? null
    : await resolveSupervisorFromEmployees({
        supervisorName: base.supervisorName,
        supervisorEmail: base.supervisorEmail,
      })

  const savedEvaluatorBelongsToCurrentSupervisor =
    samePersonBySavedEvaluatorData({
      supervisorName: base.supervisorName,
      supervisorEmail: base.supervisorEmail,
      evaluatorName: data.evaluatorName,
      evaluatorEmail: data.evaluatorEmail,
    })

  const savedPosition = savedEvaluatorBelongsToCurrentSupervisor
    ? cleanText(data.evaluatorPosition)
    : ""
  const savedDepartment = savedEvaluatorBelongsToCurrentSupervisor
    ? cleanText(data.evaluatorDepartment)
    : ""
  const savedUnitName = savedEvaluatorBelongsToCurrentSupervisor
    ? cleanText(data.evaluatorUnitName)
    : ""

  return {
    // DŮLEŽITÉ: jméno/e-mail z nástupu nebo requestu jsou hlavní.
    // EOS lookup je smí doplnit jen pokud v nástupu/requestu nic není.
    supervisorName:
      cleanText(base.supervisorName) ||
      cleanText(resolved?.supervisorName) ||
      null,
    supervisorEmail:
      cleanEmail(base.supervisorEmail) ||
      cleanEmail(resolved?.supervisorEmail) ||
      null,

    // Org data: nástupní snapshot -> EOS podle hlavního vedoucího -> uložená evaluator data jen pokud patří stejné osobě.
    supervisorPosition:
      cleanText(base.supervisorPosition) ||
      cleanText(resolved?.supervisorPosition) ||
      savedPosition ||
      null,
    supervisorDepartment:
      cleanText(base.supervisorDepartment) ||
      cleanText(resolved?.supervisorDepartment) ||
      savedDepartment ||
      null,
    supervisorUnitName:
      cleanText(base.supervisorUnitName) ||
      cleanText(resolved?.supervisorUnitName) ||
      savedUnitName ||
      null,
  }
}

const TAJEMNIK_OVERRIDE_SETTING_KEY = "tajemnik_override"

export async function getTajemnikOverride(): Promise<{
  name: string | null
  email: string | null
}> {
  const setting = await prisma.systemSettings.findUnique({
    where: { key: TAJEMNIK_OVERRIDE_SETTING_KEY },
  })

  const value = (setting?.value ?? null) as {
    name?: string | null
    email?: string | null
  } | null

  return {
    name: cleanText(value?.name) || null,
    email: cleanEmail(value?.email) || null,
  }
}

export async function setTajemnikOverride(args: {
  name: string | null
  email: string | null
  updatedBy: string
  client?: Prisma.TransactionClient
}): Promise<void> {
  const db = args.client ?? prisma
  const email = cleanEmail(args.email)
  const name = email ? cleanText(args.name) || null : null

  await db.systemSettings.upsert({
    where: { key: TAJEMNIK_OVERRIDE_SETTING_KEY },
    update: {
      value: { name, email },
      updatedBy: args.updatedBy,
      updatedAt: new Date(),
    },
    create: {
      key: TAJEMNIK_OVERRIDE_SETTING_KEY,
      value: { name, email },
      updatedBy: args.updatedBy,
    },
  })
}

export async function resolveTajemnikContext(
  request: ProbationDetail | PublicProbationDetail
): Promise<{
  tajemnikName: string | null
  tajemnikEmail: string | null
  selfIsTajemnik: boolean
  isOverridden: boolean
  overrideName: string | null
  overrideEmail: string | null
}> {
  const override = await getTajemnikOverride()

  let tajemnikName: string | null
  let tajemnikEmail: string | null
  let tajemnikPersonalNumber: string | null = null

  if (override.email) {
    tajemnikName = override.name
    tajemnikEmail = override.email
  } else {
    const tajemnik = await resolveTajemnik()
    tajemnikName = tajemnik ? buildPersonFullName(tajemnik) || null : null
    tajemnikEmail = tajemnik?.email ?? null
    tajemnikPersonalNumber = tajemnik?.personalNumber ?? null
  }

  const evalueePersonalNumber = normalizePersonalNumber(
    request.onboarding.personalNumber
  )
  const supervisorPersonalNumber = normalizePersonalNumber(
    request.onboarding.supervisorPersonalNumber
  )
  const normalizedTajemnikPersonalNumber = tajemnikPersonalNumber
    ? normalizePersonalNumber(tajemnikPersonalNumber)
    : ""

  const evalueeIsTajemnik = Boolean(
    normalizedTajemnikPersonalNumber &&
      evalueePersonalNumber &&
      normalizedTajemnikPersonalNumber === evalueePersonalNumber
  )
  const supervisorIsTajemnik = Boolean(
    normalizedTajemnikPersonalNumber &&
      supervisorPersonalNumber &&
      normalizedTajemnikPersonalNumber === supervisorPersonalNumber
  )

  return {
    tajemnikName,
    tajemnikEmail,
    isOverridden: Boolean(override.email),
    overrideName: override.name,
    overrideEmail: override.email,
    selfIsTajemnik: evalueeIsTajemnik || supervisorIsTajemnik,
  }
}

function getEvaluatorName(args: {
  parsed: ProbationSaveInput
  request: ProbationDetail | PublicProbationDetail
  user: CurrentUser
}) {
  const supervisor = supervisorBaseMeta(args.request)

  return (
    supervisor.supervisorName ||
    cleanText(args.request.supervisorName) ||
    cleanText(args.parsed.evaluatorName) ||
    cleanText(args.parsed.signature?.signedByName) ||
    cleanText(args.user.name) ||
    cleanText(args.user.email) ||
    "Neznámý hodnotitel"
  )
}

function getEvaluatorEmail(args: {
  parsed: ProbationSaveInput
  request: ProbationDetail | PublicProbationDetail
  user: CurrentUser
}) {
  const supervisor = supervisorBaseMeta(args.request)

  return (
    supervisor.supervisorEmail ||
    cleanEmail(args.request.supervisorEmail) ||
    cleanEmail(args.parsed.evaluatorEmail) ||
    cleanEmail(args.parsed.signature?.signedByEmail) ||
    cleanEmail(args.user.email) ||
    "neznamy@email.local"
  )
}

function getReasonIfNo(parsed: ProbationSaveInput) {
  if (parsed.recommendation !== "no") return null

  return parsed.reason?.trim() || parsed.reasonIfNo?.trim() || null
}

export function buildProbationSavedData(args: {
  parsed: ProbationSaveInput
  existingData: Record<string, unknown>
  request: ProbationDetail | PublicProbationDetail
  user: CurrentUser
}) {
  const { parsed, existingData, request, user } = args
  const nowIso = new Date().toISOString()
  const supervisor = supervisorBaseMeta(request)

  const evaluatorName = getEvaluatorName({ parsed, request, user })
  const evaluatorEmail = getEvaluatorEmail({ parsed, request, user })

  const signedByName =
    cleanText(parsed.signature?.signedByName) ||
    cleanText(user.name) ||
    cleanText(user.email) ||
    evaluatorName

  const signedByEmail =
    cleanEmail(parsed.signature?.signedByEmail) ||
    cleanEmail(user.email) ||
    evaluatorEmail

  const workPerformance = getWorkPerformance(parsed)
  const socialBehavior = getSocialBehavior(parsed)
  const reasonIfNo = getReasonIfNo(parsed)

  const isFinal = parsed.submitMode === "final"
  const isSignedMode =
    parsed.submitMode === "final" || parsed.submitMode === "revision"

  const data: Prisma.InputJsonObject = {
    ...(existingData as Prisma.InputJsonObject),

    submitMode: parsed.submitMode,

    workResults: parsed.workResults.trim(),
    workBehavior: parsed.workBehavior.trim(),
    socialSkills: parsed.socialSkills.trim(),
    skillsKnowledgeTraits: parsed.skillsKnowledgeTraits.trim(),

    workPerformance,
    socialBehavior,

    recommendation: parsed.recommendation,
    reason: parsed.reason?.trim() || "",
    reasonIfNo: reasonIfNo ?? "",

    evaluatorName,
    evaluatorEmail,
    evaluatorPosition:
      cleanText(parsed.evaluatorPosition) || supervisor.supervisorPosition,
    evaluatorDepartment:
      cleanText(parsed.evaluatorDepartment) || supervisor.supervisorDepartment,
    evaluatorUnitName:
      cleanText(parsed.evaluatorUnitName) || supervisor.supervisorUnitName,

    signature: {
      signedByName: isSignedMode ? signedByName : null,
      signedByEmail: isSignedMode ? signedByEmail : null,
      signedAt: isSignedMode
        ? cleanText(parsed.signature?.signedAt) || nowIso
        : null,
      signedOnBehalf: parsed.signature?.signedOnBehalf === true,
    },

    lastEditedAt: nowIso,
    lastEditedByName: user.name ?? user.email ?? null,
    lastEditedByEmail: user.email ?? null,
    formType: request.formType,

    ...(isFinal
      ? {
          evaluatedAt: nowIso,
        }
      : {}),
  }

  return data
}

export function buildProbationApiResponse(args: {
  request: ProbationDetail | PublicProbationDetail
  currentUser: CurrentUser
}) {
  const { request, currentUser } = args
  const onboarding = request.onboarding
  const data = getJsonRecord(request.data)
  const supervisor = supervisorBaseMeta(request)
  const latestEvaluation = request.evaluations?.[0] ?? null
  const serializedRequest = serializeProbationRequest(request)

  return {
    status: "success" as const,
    request: {
      ...serializedRequest,

      supervisorName: supervisor.supervisorName,
      supervisorEmail: supervisor.supervisorEmail,
      supervisorPosition: supervisor.supervisorPosition,
      supervisorDepartment: supervisor.supervisorDepartment,
      supervisorUnitName: supervisor.supervisorUnitName,

      evaluatorName:
        cleanText(data.evaluatorName) ||
        latestEvaluation?.evaluatorName ||
        serializedRequest.evaluatorName ||
        supervisor.supervisorName ||
        null,

      evaluatorEmail:
        cleanEmail(data.evaluatorEmail) ||
        latestEvaluation?.evaluatorEmail ||
        serializedRequest.evaluatorEmail ||
        supervisor.supervisorEmail ||
        null,

      evaluatorPosition:
        cleanText(data.evaluatorPosition) ||
        supervisor.supervisorPosition ||
        null,

      evaluatorDepartment:
        cleanText(data.evaluatorDepartment) ||
        supervisor.supervisorDepartment ||
        null,

      evaluatorUnitName:
        cleanText(data.evaluatorUnitName) ||
        supervisor.supervisorUnitName ||
        null,

      lastEditedAt:
        cleanText(data.lastEditedAt) ||
        toDateIso(latestEvaluation?.lastEditedAt ?? null),

      lastEditedByName:
        cleanText(data.lastEditedByName) ||
        latestEvaluation?.lastEditedByName ||
        null,

      lastEditedByEmail:
        cleanText(data.lastEditedByEmail) ||
        latestEvaluation?.lastEditedByEmail ||
        null,
    },
    onboarding: {
      id: onboarding.id,
      fullName: buildFullName(onboarding),
      personalNumber: onboarding.personalNumber ?? null,
      positionName: onboarding.positionName ?? null,
      positionType: onboarding.positionType ?? null,
      department: onboarding.department ?? null,
      unitName: onboarding.unitName ?? null,
      actualStart: toDateIso(onboarding.actualStart),
      plannedStart: toDateIso(onboarding.plannedStart),
      probationEnd: toDateIso(request.probationEnd ?? onboarding.probationEnd),

      supervisorName: supervisor.supervisorName,
      supervisorEmail: supervisor.supervisorEmail,
      supervisorPosition: supervisor.supervisorPosition,
      supervisorDepartment: supervisor.supervisorDepartment,
      supervisorUnitName: supervisor.supervisorUnitName,
    },
    currentUser: {
      name: currentUser.name ?? null,
      email: currentUser.email ?? null,
    },
  }
}

export async function buildResolvedProbationApiResponse(args: {
  request: ProbationDetail | PublicProbationDetail
  currentUser: CurrentUser
}) {
  const { request, currentUser } = args
  const onboarding = request.onboarding
  const data = getJsonRecord(request.data)
  const supervisor = await buildResolvedSupervisorMeta(request)
  const latestEvaluation = request.evaluations?.[0] ?? null
  const serializedRequest = serializeProbationRequest(request)
  const tajemnikContext = await resolveTajemnikContext(request)
  const tajemnikReview = getTajemnikReview(data.tajemnikReview)

  return {
    status: "success" as const,
    request: {
      ...serializedRequest,

      supervisorName: supervisor.supervisorName,
      supervisorEmail: supervisor.supervisorEmail,
      supervisorPosition: supervisor.supervisorPosition,
      supervisorDepartment: supervisor.supervisorDepartment,
      supervisorUnitName: supervisor.supervisorUnitName,

      evaluatorName:
        cleanText(data.evaluatorName) ||
        latestEvaluation?.evaluatorName ||
        serializedRequest.evaluatorName ||
        supervisor.supervisorName ||
        null,

      evaluatorEmail:
        cleanEmail(data.evaluatorEmail) ||
        latestEvaluation?.evaluatorEmail ||
        serializedRequest.evaluatorEmail ||
        supervisor.supervisorEmail ||
        null,

      evaluatorPosition:
        cleanText(data.evaluatorPosition) ||
        supervisor.supervisorPosition ||
        null,

      evaluatorDepartment:
        cleanText(data.evaluatorDepartment) ||
        supervisor.supervisorDepartment ||
        null,

      evaluatorUnitName:
        cleanText(data.evaluatorUnitName) ||
        supervisor.supervisorUnitName ||
        null,

      lastEditedAt:
        cleanText(data.lastEditedAt) ||
        toDateIso(latestEvaluation?.lastEditedAt ?? null),

      lastEditedByName:
        cleanText(data.lastEditedByName) ||
        latestEvaluation?.lastEditedByName ||
        null,

      lastEditedByEmail:
        cleanText(data.lastEditedByEmail) ||
        latestEvaluation?.lastEditedByEmail ||
        null,
    },
    onboarding: {
      id: onboarding.id,
      fullName: buildFullName(onboarding),
      personalNumber: onboarding.personalNumber ?? null,
      positionName: onboarding.positionName ?? null,
      positionType: onboarding.positionType ?? null,
      department: onboarding.department ?? null,
      unitName: onboarding.unitName ?? null,
      actualStart: toDateIso(onboarding.actualStart),
      plannedStart: toDateIso(onboarding.plannedStart),
      probationEnd: toDateIso(request.probationEnd ?? onboarding.probationEnd),

      supervisorName: supervisor.supervisorName,
      supervisorEmail: supervisor.supervisorEmail,
      supervisorPosition: supervisor.supervisorPosition,
      supervisorDepartment: supervisor.supervisorDepartment,
      supervisorUnitName: supervisor.supervisorUnitName,
    },
    currentUser: {
      name: currentUser.name ?? null,
      email: currentUser.email ?? null,
    },
    tajemnik: {
      name: tajemnikContext.tajemnikName,
      email: tajemnikContext.tajemnikEmail,
      selfIsTajemnik: tajemnikContext.selfIsTajemnik,
      isOverridden: tajemnikContext.isOverridden,
      overrideName: tajemnikContext.overrideName,
      overrideEmail: tajemnikContext.overrideEmail,
      isCurrentUserTajemnik: isSameTajemnikPerson({
        tajemnikName: tajemnikContext.tajemnikName,
        tajemnikEmail: tajemnikContext.tajemnikEmail,
        candidateName: currentUser.name,
        candidateEmail: currentUser.email,
      }),
      review: tajemnikReview,
    },
  }
}

function getSignedMeta(value: Prisma.InputJsonObject) {
  const signature = value.signature

  if (!signature || typeof signature !== "object" || Array.isArray(signature)) {
    return {
      signedByName: null,
      signedByEmail: null,
    }
  }

  const signatureRecord = signature as Record<string, unknown>

  return {
    signedByName:
      typeof signatureRecord.signedByName === "string"
        ? signatureRecord.signedByName
        : null,
    signedByEmail:
      typeof signatureRecord.signedByEmail === "string"
        ? signatureRecord.signedByEmail
        : null,
  }
}

async function saveTajemnikReview(args: {
  request: ProbationDetail | PublicProbationDetail
  existingData: Record<string, unknown>
  parsed: ProbationSaveInput
  user: CurrentUser
}) {
  const { request, existingData, parsed, user } = args

  if (request.status !== "COMPLETED") {
    return {
      ok: false as const,
      response: jsonError("Vyhodnocení zatím není finálně vyplněné.", 409),
    }
  }

  if (!request.tajemnikRequired) {
    return {
      ok: false as const,
      response: jsonError(
        "Pro toto vyhodnocení se vyjádření tajemníka nevyžaduje.",
        409
      ),
    }
  }

  const existingReview = getTajemnikReview(existingData.tajemnikReview)

  if (existingReview.signedAt) {
    return {
      ok: false as const,
      response: jsonError("Tajemník už se k tomuto vyhodnocení vyjádřil.", 409),
    }
  }

  const tajemnikContext = await resolveTajemnikContext(request)
  const isCurrentUserTajemnik = isSameTajemnikPerson({
    tajemnikName: tajemnikContext.tajemnikName,
    tajemnikEmail: tajemnikContext.tajemnikEmail,
    candidateName: user.name,
    candidateEmail: user.email,
  })

  if (!isCurrentUserTajemnik) {
    return {
      ok: false as const,
      response: jsonError(
        "Tento krok může dokončit pouze tajemník úřadu.",
        403
      ),
    }
  }

  const nowIso = new Date().toISOString()
  const userKey = getUserKey({ id: user.id, email: user.email })
  const userLabel = getUserLabel({ name: user.name, email: user.email })

  const review: Prisma.InputJsonObject = {
    agreement: parsed.tajemnikAgreement,
    comment: cleanText(parsed.tajemnikComment) || null,
    signedByName:
      cleanText(parsed.tajemnikSignature?.signedByName) ||
      cleanText(user.name) ||
      cleanText(user.email),
    signedByEmail:
      cleanEmail(parsed.tajemnikSignature?.signedByEmail) ||
      cleanEmail(user.email),
    signedAt: cleanText(parsed.tajemnikSignature?.signedAt) || nowIso,
    reviewedAt: nowIso,
  }

  const nextData: Prisma.InputJsonObject = {
    ...(existingData as Prisma.InputJsonObject),
    tajemnikReview: review,
  }

  await prisma.$transaction(async (tx) => {
    await tx.probationEvaluationRequest.update({
      where: { id: request.id },
      data: { data: nextData },
    })

    await addProbationEvent(tx, {
      requestId: request.id,
      action: "TAJEMNIK_REVIEWED",
      by: userKey,
      byName: userLabel,
      byEmail: user.email ?? null,
      message:
        parsed.tajemnikAgreement === "yes"
          ? "Tajemník se k vyhodnocení vyjádřil - souhlasí s doporučením."
          : "Tajemník se k vyhodnocení vyjádřil - nesouhlasí s doporučením.",
      meta: {
        agreement: parsed.tajemnikAgreement,
        comment: review.comment,
        signedByName: review.signedByName,
        signedByEmail: review.signedByEmail,
      },
    })
  })

  return {
    ok: true as const,
    submitMode: "tajemnik" as const,
  }
}

export async function saveProbationEvaluation(args: {
  request: ProbationDetail | PublicProbationDetail
  body: unknown
  user: CurrentUser
  source: "internal" | "public"
}) {
  const parsed = probationSaveSchema.safeParse(args.body)

  if (!parsed.success) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          status: "error",
          message: "Formulář obsahuje neplatná data.",
          issues: parsed.error.flatten(),
        },
        { status: 422 }
      ),
    }
  }

  if (args.request.isLocked && parsed.data.submitMode !== "tajemnik") {
    return {
      ok: false as const,
      response: jsonError("Formulář je uzamčený. Změny už nelze uložit.", 423),
    }
  }

  if (
    args.request.status === "CANCELLED" ||
    args.request.status === "EXPIRED"
  ) {
    return {
      ok: false as const,
      response: jsonError("Formulář již není dostupný k úpravám.", 409),
    }
  }

  const existingData = getJsonRecord(args.request.data)

  if (parsed.data.submitMode === "tajemnik") {
    return saveTajemnikReview({
      request: args.request,
      existingData,
      parsed: parsed.data,
      user: args.user,
    })
  }

  const previousRevision = getProbationRevisionRecord(existingData.revision)
  const revisionOpen = previousRevision.open === true
  const isCompletedRequest = args.request.status === "COMPLETED"

  if (isCompletedRequest && parsed.data.submitMode === "draft") {
    return {
      ok: false as const,
      response: jsonError(
        "U již vyplněného formuláře nelze ukládat rozpracovanou verzi. Použijte uložení změn.",
        409
      ),
    }
  }

  if (isCompletedRequest && parsed.data.submitMode !== "revision") {
    return {
      ok: false as const,
      response: jsonError(
        "Formulář už byl finálně vyplněn. Pro úpravu ho nejdříve otevřete k úpravě a použijte uložení změn.",
        409
      ),
    }
  }

  if (isCompletedRequest && !revisionOpen) {
    return {
      ok: false as const,
      response: jsonError(
        "Formulář už byl finálně vyplněn. Pro nové vyplnění kontaktujte Personální oddělení.",
        409
      ),
    }
  }

  if (!isCompletedRequest && parsed.data.submitMode === "revision") {
    return {
      ok: false as const,
      response: jsonError(
        "Uložení změn lze použít jen u již vyplněného formuláře otevřeného k úpravě.",
        409
      ),
    }
  }

  const nextData = buildProbationSavedData({
    parsed: parsed.data,
    existingData,
    request: args.request,
    user: args.user,
  })

  const userKey = getUserKey({
    id: args.user.id,
    email: args.user.email,
  })

  const userLabel = getUserLabel({
    name: args.user.name,
    email: args.user.email,
  })

  if (parsed.data.submitMode === "draft") {
    const nextStatus: ProbationEvaluationRequestStatus = args.request.sentAt
      ? "SENT"
      : args.request.supervisorEmail
        ? "READY"
        : "DRAFT"

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: args.request.id },
        data: {
          status: nextStatus,
          data: nextData,
        },
      })

      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "UPDATED",
        by: userKey,
        byName: userLabel,
        byEmail: args.user.email ?? null,
        message:
          args.source === "internal"
            ? "Rozpracované vyhodnocení zkušební doby bylo uloženo interně."
            : "Rozpracované vyhodnocení zkušební doby bylo uloženo přes veřejný odkaz.",
        meta: {
          source: args.source,
          submitMode: parsed.data.submitMode,
        },
      })
    })

    return {
      ok: true as const,
      submitMode: "draft" as const,
    }
  }

  const evaluatorName = getEvaluatorName({
    parsed: parsed.data,
    request: args.request,
    user: args.user,
  })

  const evaluatorEmail = getEvaluatorEmail({
    parsed: parsed.data,
    request: args.request,
    user: args.user,
  })

  const workPerformance = getWorkPerformance(parsed.data)
  const socialBehavior = getSocialBehavior(parsed.data)
  const reasonIfNo = getReasonIfNo(parsed.data)
  const recommendation = parsed.data.recommendation === "yes"
  const now = new Date()
  const signedMeta = getSignedMeta(nextData)

  if (parsed.data.submitMode === "revision") {
    const nowIso = now.toISOString()
    const nextRevisionCount =
      typeof previousRevision.count === "number" ? previousRevision.count : 1

    const nextRevision: ProbationRevisionRecord = {
      ...previousRevision,
      open: false,
      editedAt: nowIso,
      editedByName: userLabel,
      editedByEmail: args.user.email ?? null,
      count: nextRevisionCount,
    }

    const existingTajemnikReview = getTajemnikReview(
      existingData.tajemnikReview
    )
    const tajemnikReviewEditable =
      args.source === "internal" &&
      args.request.tajemnikRequired &&
      Boolean(existingTajemnikReview.signedAt)
    const tajemnikReviewEdited =
      tajemnikReviewEditable &&
      (parsed.data.tajemnikAgreement === "yes" ||
        parsed.data.tajemnikAgreement === "no")

    const nextTajemnikReview = tajemnikReviewEdited
      ? {
          ...existingTajemnikReview,
          agreement: parsed.data.tajemnikAgreement,
          comment: cleanText(parsed.data.tajemnikComment) || null,
        }
      : null

    const revisionData: Prisma.InputJsonObject = {
      ...(nextData as Prisma.InputJsonObject),
      ...(nextTajemnikReview
        ? { tajemnikReview: nextTajemnikReview as Prisma.InputJsonObject }
        : {}),
      revision: nextRevision as Prisma.InputJsonObject,
    }

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: args.request.id },
        data: {
          status: "COMPLETED",
          data: revisionData,
          isLocked: true,
        },
      })

      await tx.probationEvaluation.updateMany({
        where: {
          requestId: args.request.id,
          status: ProbationEvaluationStatus.ACTIVE,
        },
        data: {
          workPerformance,
          socialBehavior,
          recommendation,
          reasonIfNo,
          evaluatorName,
          evaluatorEmail,
          lastEditedAt: now,
          lastEditedBy: userKey,
          lastEditedByName: userLabel,
          lastEditedByEmail: args.user.email ?? null,
        },
      })

      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "UPDATED",
        by: userKey,
        byName: userLabel,
        byEmail: args.user.email ?? null,
        message:
          args.source === "internal"
            ? tajemnikReviewEdited
              ? "Vyhodnocení zkušební doby bylo interně upraveno včetně stanoviska tajemníka."
              : "Vyhodnocení zkušební doby bylo interně upraveno."
            : "Vyhodnocení zkušební doby bylo upraveno přes veřejný odkaz.",
        meta: {
          source: args.source,
          submitMode: parsed.data.submitMode,
          revisionAction: "edited",
          evaluatorName,
          evaluatorEmail,
          recommendation: parsed.data.recommendation,
          signedByName: signedMeta.signedByName,
          signedByEmail: signedMeta.signedByEmail,
          revision: nextRevision,
          ...(tajemnikReviewEdited
            ? { tajemnikReviewEdited: true as const }
            : {}),
        },
      })
    })

    return {
      ok: true as const,
      submitMode: "revision" as const,
    }
  }

  const tajemnikContext = await resolveTajemnikContext(args.request)

  const tajemnikRequired = !tajemnikContext.selfIsTajemnik
  const nowIsoForTajemnik = now.toISOString()

  const finalData: Prisma.InputJsonObject = {
    ...(nextData as Prisma.InputJsonObject),
    ...(tajemnikContext.selfIsTajemnik
      ? {
          tajemnikReview: {
            agreement: "yes",
            comment: null,
            signedByName: signedMeta.signedByName,
            signedByEmail: signedMeta.signedByEmail,
            signedAt: nowIsoForTajemnik,
            reviewedAt: nowIsoForTajemnik,
          } satisfies Prisma.InputJsonObject,
        }
      : {}),
  }

  await prisma.$transaction(async (tx) => {
    await tx.probationEvaluationRequest.update({
      where: { id: args.request.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        completedBy: userKey,
        completedByName: userLabel,
        completedByEmail: args.user.email ?? null,
        data: finalData,
        isLocked: true,
        tajemnikRequired,
      },
    })

    await tx.probationEvaluation.create({
      data: {
        onboardingId: args.request.onboardingId,
        requestId: args.request.id,
        status: ProbationEvaluationStatus.ACTIVE,
        formType: args.request.formType,
        workPerformance,
        socialBehavior,
        recommendation,
        reasonIfNo,
        evaluatedById: args.user.id ?? null,
        evaluatorName,
        evaluatorEmail,
        evaluatedAt: now,
        lastEditedAt: null,
        lastEditedBy: null,
        lastEditedByName: null,
        lastEditedByEmail: null,
      },
    })

    await addProbationEvent(tx, {
      requestId: args.request.id,
      action: "COMPLETED",
      by: userKey,
      byName: userLabel,
      byEmail: args.user.email ?? null,
      message:
        args.source === "internal"
          ? "Formulář vyhodnocení zkušební doby byl finálně vyplněn interně."
          : "Formulář vyhodnocení zkušební doby byl finálně vyplněn přes veřejný odkaz.",
      meta: {
        source: args.source,
        submitMode: parsed.data.submitMode,
        evaluatorName,
        evaluatorEmail,
        recommendation: parsed.data.recommendation,
        signedByName: signedMeta.signedByName,
        signedByEmail: signedMeta.signedByEmail,
        tajemnikRequired,
        selfIsTajemnik: tajemnikContext.selfIsTajemnik,
      },
    })
  })

  return {
    ok: true as const,
    submitMode: "final" as const,
    tajemnikRequired,
    tajemnikName: tajemnikContext.tajemnikName,
    tajemnikEmail: tajemnikContext.tajemnikEmail,
  }
}

async function resolveDecisionActorName(
  value: string | null | undefined
): Promise<string | null> {
  if (!value) return null

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: value }, { email: value }],
      },
      select: { name: true, surname: true, email: true },
    })

    if (user?.name && user?.surname) return `${user.name} ${user.surname}`
    if (user?.email) return user.email
  } catch {
    // ignore - vrátíme surovou hodnotu níž
  }

  return value
}

export async function buildEarlyExitNote(params: {
  personalNumber?: string | null
  probationEnd?: string | null
}): Promise<string | null> {
  const normalizedPersonalNumber = normalizePersonalNumber(
    params.personalNumber
  )

  if (!normalizedPersonalNumber) return null

  const offboardings = await prisma.employeeOffboarding.findMany({
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
      probationStopDecisionBy: true,
      probationStopNote: true,
    },
  })

  const mostRelevant = pickMostRelevantOffboarding(offboardings)

  const linkedOffboarding = buildLinkedOffboardingInfo({
    offboarding: mostRelevant,
    probationEnd: params.probationEnd,
  })

  if (!linkedOffboarding?.leftDuringProbation) return null

  const exitDateLabel = linkedOffboarding.exitDate
    ? new Date(linkedOffboarding.exitDate).toLocaleDateString("cs-CZ")
    : "neuvedeného data"

  const exitKind = linkedOffboarding.isActualExit ? "skutečný" : "plánovaný"
  const baseInfo = `Zaměstnanec ukončil pracovní poměr v průběhu zkušební doby (${exitKind} odchod k ${exitDateLabel}).`

  if (linkedOffboarding.probationStopDecision === "STOP") {
    const decidedByName = await resolveDecisionActorName(
      mostRelevant?.probationStopDecisionBy
    )
    const noteText = mostRelevant?.probationStopNote?.trim()

    return [
      `${baseInfo} Hodnocení zkušební doby bylo zastaveno${
        decidedByName ? ` (rozhodl(a): ${decidedByName})` : ""
      }.`,
      noteText ? `Poznámka: ${noteText}` : null,
    ]
      .filter(Boolean)
      .join(" ")
  }

  if (linkedOffboarding.probationStopDecision === "KEEP") {
    const decidedByName = await resolveDecisionActorName(
      mostRelevant?.probationStopDecisionBy
    )

    return `${baseInfo} Personální oddělení rozhodlo hodnocení zkušební doby nezastavovat${
      decidedByName ? ` (rozhodl(a): ${decidedByName})` : ""
    } – formulář zůstává v platnosti.`
  }

  return `${baseInfo} Toto hodnocení bylo vyplněno před ukončením poměru a je uchováno pro záznam.`
}

export async function sendCompletedProbationPdfToHr(args: {
  request: ProbationDetail | PublicProbationDetail
  user: CurrentUser
  mode?: "completed" | "revision" | "tajemnik"
  tajemnikInfo?: {
    required: boolean
    name: string | null
    agreement?: "yes" | "no" | null
  }
}) {
  const mode = args.mode ?? "completed"
  const isRevision = mode === "revision"
  const isTajemnikMode = mode === "tajemnik"
  const hrRecipients = getHrRecipientsFromEnv()

  const vedouciRecommendation = args.request.evaluations?.[0]?.recommendation
  const vedouciRecommendationLabel =
    vedouciRecommendation === true
      ? "ANO"
      : vedouciRecommendation === false
        ? "NE"
        : "bez stanoviska"

  const evaluatorDisplayName =
    args.request.evaluations?.[0]?.evaluatorName ||
    args.request.supervisorName ||
    null

  const evaluatorVerb = genderedPastVerb(
    evaluatorDisplayName,
    "vyplnil",
    "vyplnila"
  )
  const evaluatorRecommendVerb = genderedPastVerb(
    evaluatorDisplayName,
    "doporučil",
    "doporučila"
  )
  const emailIntro = isTajemnikMode
    ? `tajemník${args.tajemnikInfo?.name ? ` ${args.tajemnikInfo.name}` : " úřadu"} vyplnil finální vyjádření k vyhodnocení zkušební doby níže uvedeného zaměstnance. Aktuální PDF formulář naleznete v příloze.`
    : isRevision
      ? "Formulář k vyhodnocení zkušební doby byl upraven. Aktuální PDF formulář naleznete v příloze."
      : `Vedoucí odboru${evaluatorDisplayName ? ` ${evaluatorDisplayName}` : ""} ${evaluatorVerb} formulář Vyhodnocení zkušební doby níže uvedeného zaměstnance. Vyplněný formulář naleznete v PDF příloze.`

  const emailMessage = isTajemnikMode
    ? `Vedoucí odboru ${evaluatorRecommendVerb} pokračování pracovního poměru: ${vedouciRecommendationLabel}. Tajemník se k vyhodnocení vyjádřil - ${
        args.tajemnikInfo?.agreement === "no" ? "nesouhlasí" : "souhlasí"
      } s doporučením.`
    : !isRevision && args.tajemnikInfo?.required
      ? `Zároveň bylo zasláno tajemníkovi${args.tajemnikInfo.name ? ` ${args.tajemnikInfo.name}` : ""} k vyjádření.`
      : null

  if (hrRecipients.length === 0) {
    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "EMAIL_FAILED",
        by: getUserKey({
          id: args.user.id,
          email: args.user.email,
        }),
        byName: getUserLabel({
          name: args.user.name,
          email: args.user.email,
        }),
        byEmail: args.user.email ?? null,
        message: isTajemnikMode
          ? "Tajemník se vyjádřil, ale e-mail pro Personální oddělení nebyl odeslán, protože nejsou nastavení příjemci."
          : isRevision
            ? "Formulář byl upraven, ale e-mail pro Personální oddělení nebyl odeslán, protože nejsou nastavení příjemci."
            : "Formulář byl finálně vyplněn, ale e-mail pro Personální oddělení nebyl odeslán, protože nejsou nastavení příjemci.",
        meta: {
          reason: "missing_hr_recipients",
          mode,
        },
      })
    })

    return
  }

  const payload = await buildResolvedProbationApiResponse({
    request: args.request,
    currentUser: args.user,
  })

  const earlyExitNote = await buildEarlyExitNote({
    personalNumber: payload.onboarding.personalNumber,
    probationEnd: payload.onboarding.probationEnd,
  })

  const pdfBuffer = await renderProbationEvaluationPdfBuffer({
    ...payload,
    onboarding: {
      ...payload.onboarding,
      earlyExitNote,
    },
  })
  const employeeName = buildFullName(args.request.onboarding)
  const personalNumber =
    args.request.onboarding.personalNumber ?? String(args.request.onboardingId)

  try {
    for (const recipient of hrRecipients) {
      await sendProbationEvaluationPdfEmail({
        to: recipient,
        employeeName,
        employeePersonalNumber: args.request.onboarding.personalNumber ?? null,
        employeePosition: args.request.onboarding.positionName ?? null,
        employeeDepartment: args.request.onboarding.department ?? null,
        probationEndDate:
          args.request.probationEnd ??
          args.request.onboarding.probationEnd ??
          null,
        supervisorName: args.request.supervisorName ?? null,
        supervisorEmail: args.request.supervisorEmail ?? null,
        intro: emailIntro,
        message: emailMessage,
        sentByName: args.user.name ?? args.user.email ?? null,
        pdfBuffer,
        filename: `Vyhodnoceni-zkusebni-doby-${personalNumber}.pdf`,
      })
    }

    const supervisorEmail = args.request.supervisorEmail
    if (isTajemnikMode && supervisorEmail) {
      try {
        await sendTajemnikReviewCompletedToSupervisorEmail({
          to: supervisorEmail,
          employeeName,
          employeePersonalNumber:
            args.request.onboarding.personalNumber ?? null,
          employeePosition: args.request.onboarding.positionName ?? null,
          employeeDepartment: args.request.onboarding.department ?? null,
          probationEndDate:
            args.request.probationEnd ??
            args.request.onboarding.probationEnd ??
            null,
          supervisorName: args.request.supervisorName ?? null,
          supervisorEmail,
          tajemnikName: args.tajemnikInfo?.name ?? null,
          tajemnikAgreement:
            args.tajemnikInfo?.agreement === "no" ? "no" : "yes",
          pdfBuffer,
          pdfFilename: `Vyhodnoceni-zkusebni-doby-${personalNumber}.pdf`,
        })
      } catch (error) {
        await prisma.$transaction(async (tx) => {
          await addProbationEvent(tx, {
            requestId: args.request.id,
            action: "EMAIL_FAILED",
            by: getUserKey({ id: args.user.id, email: args.user.email }),
            byName: getUserLabel({
              name: args.user.name,
              email: args.user.email,
            }),
            byEmail: args.user.email ?? null,
            message:
              "Vedoucímu se nepodařilo odeslat upozornění, že se tajemník vyjádřil.",
            meta: {
              supervisorEmail,
              error: error instanceof Error ? error.message : String(error),
            },
          })
        })
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: {
          id: args.request.id,
        },
        data: {
          completedNotificationSentAt: new Date(),
          completedNotificationSentBy: getUserKey({
            id: args.user.id,
            email: args.user.email,
          }),
        },
      })

      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "HR_INFO_SENT",
        by: getUserKey({
          id: args.user.id,
          email: args.user.email,
        }),
        byName: getUserLabel({
          name: args.user.name,
          email: args.user.email,
        }),
        byEmail: args.user.email ?? null,
        message: isTajemnikMode
          ? `Personálnímu oddělení bylo odesláno vyjádření tajemníka včetně aktuální PDF přílohy.${supervisorEmail ? " Vedoucí byl(a) o vyjádření tajemníka informován(a) e-mailem." : ""}`
          : isRevision
            ? "Personálnímu oddělení bylo odesláno upravené vyhodnocení zkušební doby včetně nové PDF přílohy."
            : "Personálnímu oddělení bylo odesláno finální vyhodnocení zkušební doby včetně PDF přílohy.",
        meta: {
          recipients: hrRecipients,
          employeeName,
          personalNumber,
          mode,
        },
      })
    })
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "EMAIL_FAILED",
        by: getUserKey({
          id: args.user.id,
          email: args.user.email,
        }),
        byName: getUserLabel({
          name: args.user.name,
          email: args.user.email,
        }),
        byEmail: args.user.email ?? null,
        message: isTajemnikMode
          ? "Tajemník se vyjádřil, ale e-mail s PDF pro Personální oddělení se nepodařilo odeslat."
          : isRevision
            ? "Formulář byl upraven, ale e-mail s PDF pro Personální oddělení se nepodařilo odeslat."
            : "Formulář byl finálně vyplněn, ale e-mail s PDF pro Personální oddělení se nepodařilo odeslat.",
        meta: {
          recipients: hrRecipients,
          mode,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    })
  }
}

export async function sendTajemnikReviewRequestEmail(args: {
  request: ProbationDetail | PublicProbationDetail
  user: CurrentUser
  tajemnikEmail: string
  tajemnikName?: string | null
  baseUrl: string
}) {
  const userKey = getUserKey({ id: args.user.id, email: args.user.email })
  const userLabel = getUserLabel({
    name: args.user.name,
    email: args.user.email,
  })

  const payload = await buildResolvedProbationApiResponse({
    request: args.request,
    currentUser: args.user,
  })

  const earlyExitNote = await buildEarlyExitNote({
    personalNumber: payload.onboarding.personalNumber,
    probationEnd: payload.onboarding.probationEnd,
  })

  const pdfBuffer = await renderProbationEvaluationPdfBuffer({
    ...payload,
    onboarding: {
      ...payload.onboarding,
      earlyExitNote,
    },
  })

  const employeeName = buildFullName(args.request.onboarding)
  const personalNumber =
    args.request.onboarding.personalNumber ?? String(args.request.onboardingId)
  const evaluationLink = `${args.baseUrl}/vyhodnoceni-zkusebni-doby/${args.request.token}`

  try {
    await sendProbationEvaluationTajemnikReviewRequestEmail({
      to: args.tajemnikEmail,
      tajemnikName: args.tajemnikName ?? null,
      employeeName,
      employeePersonalNumber: args.request.onboarding.personalNumber ?? null,
      employeePosition: args.request.onboarding.positionName ?? null,
      employeeDepartment: args.request.onboarding.department ?? null,
      probationEndDate:
        args.request.probationEnd ??
        args.request.onboarding.probationEnd ??
        null,
      supervisorName: args.request.supervisorName ?? null,
      supervisorEmail: args.request.supervisorEmail ?? null,
      evaluationLink,
      pdfBuffer,
      filename: `Vyhodnoceni-zkusebni-doby-${personalNumber}.pdf`,
    })

    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "TAJEMNIK_REVIEW_SENT",
        by: userKey,
        byName: userLabel,
        byEmail: args.user.email ?? null,
        message: `Tajemníkovi byla odeslána žádost o vyjádření k vyhodnocení (${args.tajemnikEmail}).`,
        meta: {
          tajemnikEmail: args.tajemnikEmail,
          employeeName,
          personalNumber,
        },
      })
    })
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId: args.request.id,
        action: "EMAIL_FAILED",
        by: userKey,
        byName: userLabel,
        byEmail: args.user.email ?? null,
        message: "Žádost o vyjádření se nepodařilo odeslat tajemníkovi.",
        meta: {
          tajemnikEmail: args.tajemnikEmail,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    })
  }
}
