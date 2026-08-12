import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const bodySchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Jméno příjemce je povinné."),
        email: z.string().trim().email("Neplatný e-mail příjemce."),
      })
    )
    .min(1)
    .max(50),
})

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function normalizeEmail(value: unknown): string {
  return sanitizeText(value).toLowerCase()
}

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeRecipients(
  recipients: Array<{ name: string; email: string }>
) {
  return Array.from(
    new Map(
      recipients.map((recipient) => {
        const email = normalizeEmail(recipient.email)

        return [email, { name: sanitizeText(recipient.name), email }]
      })
    ).values()
  ).filter((recipient) => recipient.name && recipient.email)
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

  if (!canAdminExitChecklist(user.role ?? "USER")) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění upravovat příjemce k podpisu.",
      },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (!Number.isFinite(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID záznamu." },
      { status: 400 }
    )
  }

  try {
    const rawBody = await req.json().catch(() => null)
    const { recipients } = bodySchema.parse(rawBody)
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

    const offboarding = await prisma.employeeOffboarding.findFirst({
      where: { id: offboardingId, deletedAt: null },
      select: {
        id: true,
        exitChecklist: { select: { id: true, header: true } },
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
          message: "Výstupní list ještě nebyl vytvořen.",
        },
        { status: 404 }
      )
    }

    const header = getHeaderObject(offboarding.exitChecklist.header)

    const nextHeader: Prisma.InputJsonObject = {
      ...(header as Prisma.InputJsonObject),
      signatureRecipients: uniqueRecipients,
      signatureRecipientsSentAt: new Date().toISOString(),
      signatureRecipientsSentByName: user.name ?? user.email ?? null,
      signatureRecipientsSentByEmail: user.email ?? null,
    }

    await prisma.exitChecklist.update({
      where: { id: offboarding.exitChecklist.id },
      data: { header: nextHeader },
    })

    await logExitChecklistEvent({
      checklistId: offboarding.exitChecklist.id,
      action: "UPDATED",
      by: user.id,
      byName: user.name ?? user.email ?? null,
      byEmail: user.email ?? null,
      message: `Seznam příjemců k podpisu uložen (${uniqueRecipients.length}): ${uniqueRecipients.map((recipient) => `${recipient.name} <${recipient.email}>`).join(", ")}`,
    })

    return NextResponse.json({
      status: "success",
      recipients: uniqueRecipients,
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

    console.error("[SIGNATURE-RECIPIENTS] Error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Uložení seznamu příjemců se nezdařilo.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
