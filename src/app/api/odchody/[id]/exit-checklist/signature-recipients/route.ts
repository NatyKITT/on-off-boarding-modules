import { NextResponse, type NextRequest } from "next/server"
import { ChecklistResolution, Prisma } from "@prisma/client"
import { z, ZodError } from "zod"

import { prisma } from "@/lib/db"
import {
  sendSignatureAccessRestoredEmail,
  sendSignatureAccessRevokedEmail,
} from "@/lib/email"
import { mergeSignatureRecipients } from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
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
        rowKeys: z.array(z.string()).optional(),
        behalfLabel: z.string().optional(),
        invitedAt: z.string().optional(),
        revokedAt: z.string().optional(),
        substituteForKey: z.string().optional(),
        position: z.string().optional(),
        department: z.string().optional(),
      })
    )
    .min(1)
    .max(50),
  mode: z.enum(["merge", "replace"]).optional().default("replace"),
})

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function signatureSignedByEmail(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const email = (value as { signedByEmail?: unknown }).signedByEmail
  return typeof email === "string" && email ? email : null
}

function emptySignature(): Prisma.InputJsonValue {
  return { signedByName: null, signedByEmail: null, signedAt: null }
}

function getAppBaseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    req.nextUrl.origin
  ).replace(/\/$/, "")
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  const user = session?.user

  if (!user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
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
    const { recipients, mode } = bodySchema.parse(rawBody)

    const offboarding = await prisma.employeeOffboarding.findFirst({
      where: { id: offboardingId, deletedAt: null },
      select: {
        id: true,
        name: true,
        surname: true,
        titleBefore: true,
        titleAfter: true,
        positionName: true,
        department: true,
        actualEnd: true,
        plannedEnd: true,
        exitChecklist: {
          select: {
            id: true,
            header: true,
            publicToken: true,
            items: { select: { key: true, signedByEmail: true } },
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
          message: "Výstupní list ještě nebyl vytvořen.",
        },
        { status: 404 }
      )
    }

    const header = getHeaderObject(offboarding.exitChecklist.header)
    const existingRecipients = Array.isArray(header.signatureRecipients)
      ? header.signatureRecipients
      : []

    const uniqueRecipients =
      mode === "merge"
        ? mergeSignatureRecipients(existingRecipients, recipients)
        : mergeSignatureRecipients(null, recipients)

    if (uniqueRecipients.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Chybí alespoň jeden příjemce s platným e-mailem.",
        },
        { status: 400 }
      )
    }

    const existingByKey = new Map<string, { revokedAt?: string }>()
    existingRecipients.forEach((recipient) => {
      if (recipient && typeof recipient === "object") {
        existingByKey.set(
          recipientIdentityKey(recipient as { email: string }),
          recipient as { revokedAt?: string }
        )
      }
    })

    const newlyRevoked = uniqueRecipients.filter((recipient) => {
      const key = recipientIdentityKey(recipient)
      const before = existingByKey.get(key)
      return Boolean(recipient.revokedAt) && !before?.revokedAt
    })
    const newlyRestored = uniqueRecipients.filter((recipient) => {
      const key = recipientIdentityKey(recipient)
      const before = existingByKey.get(key)
      return !recipient.revokedAt && Boolean(before?.revokedAt)
    })

    const stillActiveEmails = new Set(
      uniqueRecipients
        .filter((recipient) => !recipient.revokedAt)
        .map((recipient) => normalizeEmail(recipient.email))
    )
    const newlyRevokedEmails = new Set(
      newlyRevoked
        .map((recipient) => normalizeEmail(recipient.email))
        .filter((email) => !stillActiveEmails.has(email))
    )

    const recipientsToStore = uniqueRecipients.filter(
      (recipient) => !(recipient.revokedAt && recipient.behalfLabel)
    )

    const itemsToClear =
      newlyRevokedEmails.size > 0
        ? offboarding.exitChecklist.items.filter(
            (item) =>
              item.signedByEmail &&
              newlyRevokedEmails.has(normalizeEmail(item.signedByEmail))
          )
        : []

    const signaturesObj = getHeaderObject(header.signatures)
    const nextSignatures: Record<string, unknown> = { ...signaturesObj }
    const signatureClearedEmails = new Set<string>()
    let headerSignatureCleared = false

    if (newlyRevokedEmails.size > 0) {
      for (const slot of ["employee", "manager", "issuer"] as const) {
        const signedByEmail = signatureSignedByEmail(signaturesObj[slot])
        if (
          signedByEmail &&
          newlyRevokedEmails.has(normalizeEmail(signedByEmail))
        ) {
          nextSignatures[slot] = emptySignature()
          signatureClearedEmails.add(normalizeEmail(signedByEmail))
          headerSignatureCleared = true
        }
      }
    }

    let nextHandoverManagerSignature = header.handoverManagerSignature
    const handoverManagerSignedByEmail = signatureSignedByEmail(
      header.handoverManagerSignature
    )
    if (
      newlyRevokedEmails.size > 0 &&
      handoverManagerSignedByEmail &&
      newlyRevokedEmails.has(normalizeEmail(handoverManagerSignedByEmail))
    ) {
      nextHandoverManagerSignature = emptySignature()
      signatureClearedEmails.add(normalizeEmail(handoverManagerSignedByEmail))
      headerSignatureCleared = true
    }

    itemsToClear.forEach((item) => {
      if (item.signedByEmail) {
        signatureClearedEmails.add(normalizeEmail(item.signedByEmail))
      }
    })

    const nextHeader: Prisma.InputJsonObject = {
      ...(header as Prisma.InputJsonObject),
      signatureRecipients:
        recipientsToStore as unknown as Prisma.InputJsonValue,
      signatureRecipientsSentAt: new Date().toISOString(),
      signatureRecipientsSentByName: user.name ?? user.email ?? null,
      signatureRecipientsSentByEmail: user.email ?? null,
      ...(headerSignatureCleared
        ? {
            signatures: nextSignatures as unknown as Prisma.InputJsonValue,
            handoverManagerSignature:
              nextHandoverManagerSignature as unknown as Prisma.InputJsonValue,
          }
        : {}),
    }

    await prisma.$transaction([
      ...(itemsToClear.length > 0
        ? [
            prisma.exitChecklistItem.updateMany({
              where: {
                checklistId: offboarding.exitChecklist.id,
                key: { in: itemsToClear.map((item) => item.key) },
              },
              data: {
                resolution: ChecklistResolution.NOT_APPLICABLE,
                signedById: null,
                signedByName: null,
                signedByEmail: null,
                signedAt: null,
              },
            }),
          ]
        : []),
      prisma.exitChecklist.update({
        where: { id: offboarding.exitChecklist.id },
        data: { header: nextHeader },
      }),
    ])

    const employeeName = [
      offboarding.titleBefore,
      offboarding.name,
      offboarding.surname,
      offboarding.titleAfter,
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    const endDate = offboarding.actualEnd ?? offboarding.plannedEnd
    const employmentEndDate = endDate
      ? new Date(endDate).toLocaleDateString("cs-CZ")
      : null
    const signUrl = offboarding.exitChecklist.publicToken
      ? `${getAppBaseUrl(req)}/odchody-public/${offboarding.exitChecklist.publicToken}`
      : null

    for (const recipient of newlyRevoked) {
      try {
        await sendSignatureAccessRevokedEmail({
          to: recipient.email,
          employeeName,
          employeePosition: offboarding.positionName,
          employeeDepartment: offboarding.department,
          employmentEndDate,
          behalfLabel: recipient.behalfLabel ?? null,
          stillHasOtherAccess: stillActiveEmails.has(
            normalizeEmail(recipient.email)
          ),
        })
      } catch (error) {
        console.error(
          "[SIGNATURE-RECIPIENTS] E-mail o odebrání se nepodařilo odeslat:",
          error
        )
      }
    }

    if (signUrl) {
      for (const recipient of newlyRestored) {
        try {
          await sendSignatureAccessRestoredEmail({
            to: recipient.email,
            employeeName,
            employeePosition: offboarding.positionName,
            employeeDepartment: offboarding.department,
            employmentEndDate,
            signUrl,
          })
        } catch (error) {
          console.error(
            "[SIGNATURE-RECIPIENTS] E-mail o návratu se nepodařilo odeslat:",
            error
          )
        }
      }
    }

    const notifyParts: string[] = []
    if (newlyRevoked.length > 0) {
      notifyParts.push(
        `odebráno a informováno: ${newlyRevoked.map((r) => r.email).join(", ")}`
      )
    }
    if (newlyRestored.length > 0) {
      notifyParts.push(
        `vráceno a informováno: ${newlyRestored.map((r) => r.email).join(", ")}`
      )
    }
    if (signatureClearedEmails.size > 0) {
      notifyParts.push(
        `podpis zrušen u: ${Array.from(signatureClearedEmails).join(", ")}`
      )
    }

    await logExitChecklistEvent({
      checklistId: offboarding.exitChecklist.id,
      action: "UPDATED",
      by: user.id,
      byName: user.name ?? user.email ?? null,
      byEmail: user.email ?? null,
      message: `Seznam příjemců k podpisu uložen (${recipientsToStore.length}): ${recipientsToStore.map((recipient) => `${recipient.name} <${recipient.email}>`).join(", ")}${
        notifyParts.length > 0 ? `. ${notifyParts.join("; ")}.` : ""
      }`,
    })

    return NextResponse.json({
      status: "success",
      recipients: recipientsToStore,
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
