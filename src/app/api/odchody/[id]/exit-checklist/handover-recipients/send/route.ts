import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import { sendHandoverRecipientEmail } from "@/lib/email"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const recipientSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(1, "Jméno příjemce je povinné."),
  email: z.string().trim().email("Neplatný e-mail příjemce."),
  personalNumber: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
})

const bodySchema = z.object({
  force: z.boolean().optional().default(false),
  recipients: z.array(recipientSchema).min(1).max(50),
  handover: z
    .object({
      includeHandoverAgenda: z.boolean().optional(),
      option1: z.boolean().optional(),
      option2: z.boolean().optional(),
      option2Target: z.string().optional().nullable(),
      option2TargetPositionNum: z.string().optional().nullable(),
      option3: z.boolean().optional(),
      option3Reason: z.string().optional().nullable(),
      responsibleParty: z.enum(["KITT6", "OSS_KT"]).optional().nullable(),

      handoverRecipientsSentAt: z.string().optional().nullable(),
      handoverRecipientsSentByName: z.string().optional().nullable(),
      handoverRecipientsSentByEmail: z.string().optional().nullable(),
      handoverRecipientsSentHash: z.string().optional().nullable(),
      handoverRecipientsSentCount: z.number().optional().nullable(),
    })
    .passthrough()
    .optional()
    .nullable(),
})

type NormalizedRecipient = z.infer<typeof recipientSchema>

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function sanitizeNullableText(value: unknown): string | null {
  return sanitizeText(value) || null
}

function normalizeEmail(value: unknown): string {
  return sanitizeText(value).toLowerCase()
}

function sanitizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return 0
}

function formatCzDate(date: Date | null | undefined) {
  if (!date) return "—"

  return date.toLocaleDateString("cs-CZ")
}

function buildEmployeeName(offboarding: {
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
}) {
  return [
    offboarding.titleBefore,
    offboarding.name,
    offboarding.surname,
    offboarding.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
}

function buildEmployeeDepartment(offboarding: {
  department: string | null
  unitName?: string | null
}) {
  return [offboarding.department, offboarding.unitName]
    .filter(Boolean)
    .join(" – ")
}

function normalizeRecipients(recipients: NormalizedRecipient[]) {
  return Array.from(
    new Map(
      recipients.map((recipient) => {
        const email = normalizeEmail(recipient.email)

        return [
          email,
          {
            id: sanitizeText(recipient.id) || email,
            name: sanitizeText(recipient.name),
            email,
            personalNumber: sanitizeNullableText(recipient.personalNumber),
            department: sanitizeNullableText(recipient.department),
          },
        ]
      })
    ).values()
  ).filter((recipient) => recipient.name && recipient.email)
}

function buildRecipientHash(
  recipients: Array<{
    email: string
    name: string
    personalNumber?: string | null
    department?: string | null
  }>
) {
  return recipients
    .map((recipient) => ({
      email: normalizeEmail(recipient.email),
      name: sanitizeText(recipient.name),
      personalNumber: sanitizeText(recipient.personalNumber) || "",
      department: sanitizeText(recipient.department) || "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((recipient) =>
      [
        recipient.email,
        recipient.name,
        recipient.personalNumber,
        recipient.department,
      ].join("|")
    )
    .join(";;")
}

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function getHandoverObject(value: unknown): Record<string, unknown> {
  const header = getHeaderObject(value)

  return header.handover &&
    typeof header.handover === "object" &&
    !Array.isArray(header.handover)
    ? (header.handover as Record<string, unknown>)
    : {}
}

function getExistingHandoverSendHistory(
  existingHandover: Record<string, unknown>
) {
  return Array.isArray(existingHandover.handoverSendHistory)
    ? existingHandover.handoverSendHistory.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : []
}

function getExistingRecipientsWithSendMetadata(
  existingHandover: Record<string, unknown>
) {
  return Array.isArray(existingHandover.handoverRecipients)
    ? existingHandover.handoverRecipients.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : []
}

function mergeHandoverSendHistory({
  existingHandover,
  recipients,
  sentAt,
  sentByName,
  sentByEmail,
}: {
  existingHandover: Record<string, unknown>
  recipients: ReturnType<typeof normalizeRecipients>
  sentAt: string
  sentByName: string | null
  sentByEmail: string | null
}): Prisma.InputJsonArray {
  const historyByEmail = new Map<string, Prisma.InputJsonObject>()

  for (const item of getExistingHandoverSendHistory(existingHandover)) {
    const email = normalizeEmail(item.email)

    if (!email) continue

    historyByEmail.set(email, {
      id: sanitizeText(item.id) || email,
      name: sanitizeText(item.name) || email,
      email,
      personalNumber: sanitizeNullableText(item.personalNumber),
      department: sanitizeNullableText(item.department),
      lastSentAt: sanitizeNullableText(item.lastSentAt),
      lastSentByName: sanitizeNullableText(item.lastSentByName),
      lastSentByEmail: sanitizeNullableText(item.lastSentByEmail),
      sentCount: sanitizeNumber(item.sentCount),
    })
  }

  for (const item of getExistingRecipientsWithSendMetadata(existingHandover)) {
    const email = normalizeEmail(item.email)
    if (!email || historyByEmail.has(email)) continue

    const lastSentAt = sanitizeNullableText(item.handoverInfoLastSentAt)
    const sentCount = sanitizeNumber(item.handoverInfoSentCount)

    if (!lastSentAt && sentCount <= 0) continue

    historyByEmail.set(email, {
      id: sanitizeText(item.id) || email,
      name: sanitizeText(item.name) || email,
      email,
      personalNumber: sanitizeNullableText(item.personalNumber),
      department: sanitizeNullableText(item.department),
      lastSentAt,
      lastSentByName: sanitizeNullableText(item.handoverInfoLastSentByName),
      lastSentByEmail: sanitizeNullableText(item.handoverInfoLastSentByEmail),
      sentCount,
    })
  }

  for (const recipient of recipients) {
    const email = normalizeEmail(recipient.email)
    if (!email) continue

    const previous = historyByEmail.get(email)
    const previousCount = sanitizeNumber(previous?.sentCount)

    historyByEmail.set(email, {
      id: recipient.id || sanitizeText(previous?.id) || email,
      name: recipient.name || sanitizeText(previous?.name) || email,
      email,
      personalNumber:
        recipient.personalNumber ||
        sanitizeNullableText(previous?.personalNumber),
      department:
        recipient.department || sanitizeNullableText(previous?.department),
      lastSentAt: sentAt,
      lastSentByName: sentByName,
      lastSentByEmail: sentByEmail,
      sentCount: previousCount + 1,
    })
  }

  return Array.from(historyByEmail.values()).sort((a, b) => {
    const aTime = sanitizeText(a.lastSentAt)
      ? new Date(String(a.lastSentAt)).getTime()
      : 0
    const bTime = sanitizeText(b.lastSentAt)
      ? new Date(String(b.lastSentAt)).getTime()
      : 0

    return bTime - aTime
  })
}

function getExistingRecipientSendState(
  existingHandover: Record<string, unknown>,
  email: string
) {
  const normalizedEmail = normalizeEmail(email)

  const existingRecipient = getExistingRecipientsWithSendMetadata(
    existingHandover
  ).find((item) => normalizeEmail(item.email) === normalizedEmail)

  if (existingRecipient) {
    return {
      lastSentAt:
        sanitizeNullableText(existingRecipient.handoverInfoLastSentAt) ?? null,
      lastSentByName:
        sanitizeNullableText(existingRecipient.handoverInfoLastSentByName) ??
        null,
      lastSentByEmail:
        sanitizeNullableText(existingRecipient.handoverInfoLastSentByEmail) ??
        null,
      sentCount: sanitizeNumber(existingRecipient.handoverInfoSentCount),
    }
  }

  const existingHistory = getExistingHandoverSendHistory(existingHandover).find(
    (item) => normalizeEmail(item.email) === normalizedEmail
  )

  return {
    lastSentAt: sanitizeNullableText(existingHistory?.lastSentAt),
    lastSentByName: sanitizeNullableText(existingHistory?.lastSentByName),
    lastSentByEmail: sanitizeNullableText(existingHistory?.lastSentByEmail),
    sentCount: sanitizeNumber(existingHistory?.sentCount),
  }
}

function buildNextHandoverJson({
  rawHandover,
  existingHandover,
  recipients,
  sentAt,
  sentByName,
  sentByEmail,
  recipientsHash,
}: {
  rawHandover: z.infer<typeof bodySchema>["handover"]
  existingHandover: Record<string, unknown>
  recipients: ReturnType<typeof normalizeRecipients>
  sentAt: string
  sentByName: string | null
  sentByEmail: string | null
  recipientsHash: string
}): Prisma.InputJsonObject {
  const source = rawHandover ?? existingHandover
  const previousCount = sanitizeNumber(
    existingHandover.handoverRecipientsSentCount
  )

  const handoverSendHistory = mergeHandoverSendHistory({
    existingHandover,
    recipients,
    sentAt,
    sentByName,
    sentByEmail,
  })

  return {
    includeHandoverAgenda: Boolean(source.includeHandoverAgenda ?? true),
    option1: Boolean(source.option1),
    option2: Boolean(source.option2 ?? false),
    option2Target: sanitizeText(source.option2Target),
    option2TargetPositionNum: sanitizeText(source.option2TargetPositionNum),
    option3: Boolean(source.option3),
    option3Reason: sanitizeText(source.option3Reason),
    responsibleParty: null,

    handoverRecipients: recipients.map((recipient): Prisma.InputJsonObject => {
      const previous = getExistingRecipientSendState(
        existingHandover,
        recipient.email
      )

      return {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        personalNumber: recipient.personalNumber,
        department: recipient.department,

        handoverInfoLastSentAt: sentAt,
        handoverInfoLastSentByName: sentByName,
        handoverInfoLastSentByEmail: sentByEmail,
        handoverInfoSentCount: previous.sentCount + 1,
      }
    }) as Prisma.InputJsonArray,

    handoverSendHistory,

    handoverRecipientsSentAt: sentAt,
    handoverRecipientsSentByName: sentByName,
    handoverRecipientsSentByEmail: sentByEmail,
    handoverRecipientsSentHash: recipientsHash,
    handoverRecipientsSentCount: previousCount + 1,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  const user = session?.user

  if (!user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const role = user.role ?? "USER"

  if (!canAdminExitChecklist(role)) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Nemáte oprávnění odesílat informace příjemcům předávané agendy.",
      },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (Number.isNaN(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu." },
      { status: 400 }
    )
  }

  try {
    const rawBody = await req.json().catch(() => null)
    const { recipients, handover, force } = bodySchema.parse(rawBody)
    const uniqueRecipients = normalizeRecipients(recipients)

    if (uniqueRecipients.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Chybí alespoň jeden příjemce s platným e-mailem.",
        },
        { status: 400 }
      )
    }

    const recipientsHash = buildRecipientHash(uniqueRecipients)

    const offboarding = await prisma.employeeOffboarding.findUnique({
      where: { id: offboardingId },
      select: {
        id: true,
        titleBefore: true,
        name: true,
        surname: true,
        titleAfter: true,
        positionName: true,
        department: true,
        unitName: true,
        actualEnd: true,
        plannedEnd: true,
        deletedAt: true,
        exitChecklist: {
          select: {
            id: true,
            header: true,
            lockedAt: true,
          },
        },
      },
    })

    if (!offboarding) {
      return NextResponse.json(
        { status: "error", message: "Odchod nebyl nalezen." },
        { status: 404 }
      )
    }

    if (offboarding.deletedAt) {
      return NextResponse.json(
        {
          status: "error",
          message: "Nelze odesílat informace ke smazanému záznamu odchodu.",
        },
        { status: 409 }
      )
    }

    if (!offboarding.exitChecklist) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Výstupní list ještě nebyl vytvořen. Nejdříve ho otevřete a uložte.",
        },
        { status: 404 }
      )
    }

    if (offboarding.exitChecklist.lockedAt) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Výstupní list je uzamčený. Po uzamčení už nelze odesílat informace příjemcům agendy.",
        },
        { status: 423 }
      )
    }

    const header = getHeaderObject(offboarding.exitChecklist.header)
    const existingHandover = getHandoverObject(offboarding.exitChecklist.header)

    const alreadySentSameRecipients =
      Boolean(existingHandover.handoverRecipientsSentAt) &&
      sanitizeText(existingHandover.handoverRecipientsSentHash) ===
        recipientsHash

    if (alreadySentSameRecipients && !force) {
      return NextResponse.json(
        {
          status: "error",
          code: "ALREADY_SENT",
          message:
            "Informace pro aktuální seznam příjemců už byly odeslány. Potvrďte opakované odeslání.",
          data: {
            sentAt: existingHandover.handoverRecipientsSentAt,
            sentByName: existingHandover.handoverRecipientsSentByName ?? null,
            recipientsHash,
            handoverSendHistory: existingHandover.handoverSendHistory ?? null,
          },
        },
        { status: 409 }
      )
    }

    const employeeName = buildEmployeeName(offboarding)
    const employmentEndDate = formatCzDate(
      offboarding.actualEnd ?? offboarding.plannedEnd
    )

    const sentAt = new Date().toISOString()
    const sentByName = user.name ?? user.email ?? null
    const sentByEmail = user.email ?? null

    const employeeDepartment = buildEmployeeDepartment(offboarding)

    const results = await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendHandoverRecipientEmail({
          to: recipient.email,
          employeeName,
          employeePosition: offboarding.positionName ?? "",
          employeeDepartment,
          employmentEndDate,
          option3Reason:
            sanitizeText(handover?.option3Reason) ||
            sanitizeText(existingHandover.option3Reason) ||
            null,
          sentByName,
        })
      )
    )

    const failed = results
      .map((result, index) => ({ result, recipient: uniqueRecipients[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, recipient }) => ({
        email: recipient.email,
        message:
          result.status === "rejected" && result.reason instanceof Error
            ? result.reason.message
            : "Odeslání se nezdařilo.",
      }))

    if (failed.length > 0) {
      return NextResponse.json(
        {
          status: "error",
          message:
            failed.length === uniqueRecipients.length
              ? "Nepodařilo se odeslat žádný e-mail."
              : "Část e-mailů se nepodařilo odeslat. Stav odeslání nebyl uložen, aby nedošlo k nejasnostem.",
          failed,
        },
        { status: 500 }
      )
    }

    const nextHandover = buildNextHandoverJson({
      rawHandover: handover,
      existingHandover,
      recipients: uniqueRecipients,
      sentAt,
      sentByName,
      sentByEmail,
      recipientsHash,
    })

    const nextHeader: Prisma.InputJsonObject = {
      ...(header as Prisma.InputJsonObject),
      handover: nextHandover,
    }

    await prisma.exitChecklist.update({
      where: { id: offboarding.exitChecklist.id },
      data: { header: nextHeader },
    })

    const sendCount = sanitizeNumber(nextHandover.handoverRecipientsSentCount)

    return NextResponse.json({
      status: "success",
      message: force
        ? "Informace byly odeslány znovu."
        : "Informace byly odeslány osobám uvedeným v části „Za dokumenty odpovídá“.",
      sentAt,
      sentByName,
      sentByEmail,
      sentHash: recipientsHash,
      sentCount: sendCount,
      handoverSendHistory: nextHandover.handoverSendHistory,
      history: nextHandover.handoverSendHistory,
      data: {
        requested: recipients.length,
        sent: uniqueRecipients.length,
        failed: [],
        sentAt,
        sentByName,
        sentByEmail,
        sentHash: recipientsHash,
        recipientsHash,
        sentCount: sendCount,
        sendCount,
        recipients: nextHandover.handoverRecipients,
        handoverSendHistory: nextHandover.handoverSendHistory,
        history: nextHandover.handoverSendHistory,
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          status: "error",
          message: "Neplatný formát příjemců.",
          errors: error.issues,
        },
        { status: 400 }
      )
    }

    console.error("[HANDOVER-RECIPIENTS SEND] Error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při odesílání informací příjemcům agendy.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
