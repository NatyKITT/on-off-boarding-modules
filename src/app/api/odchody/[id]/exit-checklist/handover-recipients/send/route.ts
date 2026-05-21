import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import { sendHandoverRecipientEmail } from "@/lib/email"
import { hasPerm } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

function normalizeEmail(value: unknown): string {
  return sanitizeText(value).toLowerCase()
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

function normalizeRecipients(recipients: NormalizedRecipient[]) {
  return Array.from(
    new Map(
      recipients.map((recipient) => {
        const email = normalizeEmail(recipient.email)

        return [
          email,
          {
            id: recipient.id ?? email,
            name: sanitizeText(recipient.name),
            email,
            personalNumber: sanitizeText(recipient.personalNumber) || null,
            department: sanitizeText(recipient.department) || null,
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
  }>
) {
  return recipients
    .map((recipient) => ({
      email: normalizeEmail(recipient.email),
      name: sanitizeText(recipient.name),
      personalNumber: sanitizeText(recipient.personalNumber) || "",
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
    .map((recipient) =>
      [recipient.email, recipient.name, recipient.personalNumber].join("|")
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
  const previousCount = Number(
    existingHandover.handoverRecipientsSentCount ?? 0
  )

  return {
    includeHandoverAgenda: Boolean(source.includeHandoverAgenda ?? true),
    option1: Boolean(source.option1),
    option2: Boolean(source.option2 ?? true),
    option2Target: sanitizeText(source.option2Target),
    option2TargetPositionNum: sanitizeText(source.option2TargetPositionNum),
    option3: Boolean(source.option3),
    option3Reason: sanitizeText(source.option3Reason),
    responsibleParty:
      source.responsibleParty === "KITT6" ||
      source.responsibleParty === "OSS_KT"
        ? source.responsibleParty
        : null,
    handoverRecipients: recipients.map(
      (recipient): Prisma.InputJsonObject => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        personalNumber: recipient.personalNumber,
        department: recipient.department,
      })
    ) as Prisma.InputJsonArray,
    handoverRecipientsSentAt: sentAt,
    handoverRecipientsSentByName: sentByName,
    handoverRecipientsSentByEmail: sentByEmail,
    handoverRecipientsSentHash: recipientsHash,
    handoverRecipientsSentCount: Number.isFinite(previousCount)
      ? previousCount + 1
      : 1,
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
  const canSend = hasPerm(role, "EXIT_CHECKLIST_SIGN")

  if (!canSend) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění odesílat informace příjemcům agendy.",
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
        actualEnd: true,
        plannedEnd: true,
        exitChecklist: {
          select: {
            id: true,
            header: true,
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
          },
        },
        { status: 409 }
      )
    }

    const employeeName = buildEmployeeName(offboarding)
    const employmentEndDate = formatCzDate(
      offboarding.actualEnd ?? offboarding.plannedEnd
    )

    const results = await Promise.allSettled(
      uniqueRecipients.map((recipient) =>
        sendHandoverRecipientEmail({
          to: recipient.email,
          employeeName,
          employeePosition: offboarding.positionName ?? "",
          employeeDepartment: offboarding.department ?? "",
          employmentEndDate,
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

    const sentAt = new Date().toISOString()
    const sentByName = user.name ?? user.email ?? null
    const sentByEmail = user.email ?? null

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

    const sendCount = Number(nextHandover.handoverRecipientsSentCount ?? 1)

    return NextResponse.json({
      status: "success",
      message: force
        ? "Informace byly odeslány znovu."
        : "Informace byly odeslány příjemcům předávané agendy.",
      sentAt,
      sentByName,
      sentByEmail,
      sentHash: recipientsHash,
      sentCount: sendCount,
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
