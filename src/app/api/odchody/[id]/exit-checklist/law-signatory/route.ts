import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { LAW_SIGNATORY } from "@/config/exit-checklist-signatories"

import { prisma } from "@/lib/db"
import { sendExitChecklistSignatoryRemovedEmail } from "@/lib/email"
import { mergeSignatureRecipients } from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function POST(
  _req: NextRequest,
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
      exitChecklist: { select: { id: true, header: true } },
    },
  })

  if (!offboarding || !offboarding.exitChecklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  const header = getHeaderObject(offboarding.exitChecklist.header)
  const lawEmail = LAW_SIGNATORY.emails[0]?.trim().toLowerCase()

  if (!lawEmail) {
    return NextResponse.json(
      { status: "error", message: "Právní odbor nemá nastavený e-mail." },
      { status: 500 }
    )
  }

  const existingRecipients = Array.isArray(header.signatureRecipients)
    ? header.signatureRecipients
    : []

  const targetKey = recipientIdentityKey({
    email: lawEmail,
    behalfLabel: LAW_SIGNATORY.name,
  })
  const target = existingRecipients.find(
    (recipient) =>
      recipient &&
      typeof recipient === "object" &&
      recipientIdentityKey(recipient as { email: string }) === targetKey
  ) as { email: string; revokedAt?: string } | undefined

  if (!target || target.revokedAt) {
    return NextResponse.json({
      status: "ok",
      message: "Právní odbor už v seznamu k podpisu není aktivní.",
    })
  }

  const updatedRecipients = existingRecipients.map((recipient) =>
    recipient &&
    typeof recipient === "object" &&
    recipientIdentityKey(recipient as { email: string }) === targetKey
      ? { ...recipient, revokedAt: new Date().toISOString() }
      : recipient
  )

  const uniqueRecipients = mergeSignatureRecipients(null, updatedRecipients)

  const nextHeader: Prisma.InputJsonObject = {
    ...(header as Prisma.InputJsonObject),
    signatureRecipients: uniqueRecipients as unknown as Prisma.InputJsonValue,
  }

  await prisma.exitChecklist.update({
    where: { id: offboarding.exitChecklist.id },
    data: { header: nextHeader },
  })

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

  try {
    await sendExitChecklistSignatoryRemovedEmail({
      to: lawEmail,
      employeeName,
      employeePosition: offboarding.positionName,
      employeeDepartment: offboarding.department,
      employmentEndDate,
    })
  } catch (error) {
    console.error("[LAW-SIGNATORY-REMOVE] E-mail se nepodařilo odeslat:", error)
  }

  await logExitChecklistEvent({
    checklistId: offboarding.exitChecklist.id,
    action: "UPDATED",
    by: user.id,
    byName: user.name ?? user.email ?? null,
    byEmail: user.email ?? null,
    message: `Právní odbor (${LAW_SIGNATORY.name}) odebrán ze seznamu k podpisu po zrušení střetu zájmů, odeslána informační zpráva na ${lawEmail}.`,
  })

  return NextResponse.json({ status: "ok" })
}
