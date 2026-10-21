import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { sendSignatureSubstituteNoticeEmail } from "@/lib/email"
import { mergeSignatureRecipients } from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import {
  EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
  EXIT_CHECKLIST_SECTION_B_ROLE_NOTE,
} from "@/lib/exit-checklist-role-notes"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
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

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { status: "error", message: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const action =
    cleanText((body as Record<string, unknown>).action) === "remove"
      ? "remove"
      : "add"
  const originalEmail = cleanText(
    (body as Record<string, unknown>).originalEmail
  ).toLowerCase()
  const originalName = cleanText((body as Record<string, unknown>).originalName)
  const originalBehalfLabel = cleanText(
    (body as Record<string, unknown>).originalBehalfLabel
  )
  const substituteEmail = cleanText(
    (body as Record<string, unknown>).substituteEmail
  ).toLowerCase()
  const substituteBehalfLabel = cleanText(
    (body as Record<string, unknown>).substituteBehalfLabel
  )
  const substituteNameDirect = cleanText(
    (body as Record<string, unknown>).substituteName
  )
  const substitutePositionDirect = cleanText(
    (body as Record<string, unknown>).substitutePosition
  )
  const substituteDepartmentDirect = cleanText(
    (body as Record<string, unknown>).substituteDepartment
  )

  if (!originalEmail || !substituteEmail) {
    return NextResponse.json(
      { status: "error", message: "Chybí e-mail originálu nebo náhradníka." },
      { status: 400 }
    )
  }

  if (action === "remove") {
    const offboardingForRemoval = await prisma.employeeOffboarding.findFirst({
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
          select: { id: true, header: true, publicToken: true },
        },
      },
    })

    if (!offboardingForRemoval || !offboardingForRemoval.exitChecklist) {
      return NextResponse.json(
        { status: "error", message: "Výstupní list nebyl nalezen." },
        { status: 404 }
      )
    }

    const removalHeader = getHeaderObject(
      offboardingForRemoval.exitChecklist.header
    )
    const removalManagerEmail = cleanText(
      removalHeader.managerEmail
    ).toLowerCase()
    const removalSectionBHeader = getHeaderObject(
      removalHeader.sectionBResponsible
    )
    const removalSectionBEmail = cleanText(
      removalSectionBHeader.email
    ).toLowerCase()
    const removalRoleNote =
      originalEmail === removalManagerEmail
        ? EXIT_CHECKLIST_MANAGER_ROLE_NOTE
        : originalEmail === removalSectionBEmail
          ? EXIT_CHECKLIST_SECTION_B_ROLE_NOTE
          : null

    const removalEmployeeName = [
      offboardingForRemoval.titleBefore,
      offboardingForRemoval.name,
      offboardingForRemoval.surname,
      offboardingForRemoval.titleAfter,
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    const removalEndDate =
      offboardingForRemoval.actualEnd ?? offboardingForRemoval.plannedEnd
    const removalEmploymentEndDate = removalEndDate
      ? new Date(removalEndDate).toLocaleDateString("cs-CZ")
      : null

    const removalSignUrl = offboardingForRemoval.exitChecklist.publicToken
      ? `${getAppBaseUrl(req)}/odchody-public/${offboardingForRemoval.exitChecklist.publicToken}`
      : null

    if (removalSignUrl) {
      try {
        await sendSignatureSubstituteNoticeEmail({
          to: originalEmail,
          employeeName: removalEmployeeName,
          employeePosition: offboardingForRemoval.positionName,
          employeeDepartment: offboardingForRemoval.department,
          employmentEndDate: removalEmploymentEndDate,
          signUrl: removalSignUrl,
          substituteName: substituteNameDirect || substituteEmail,
          substitutePosition: substitutePositionDirect || undefined,
          substituteDepartment: substituteDepartmentDirect || undefined,
          roleNote: removalRoleNote,
          removed: true,
        })
      } catch (error) {
        console.error(
          "[SIGNATURE-SUBSTITUTE] E-mail o zrušení se nepodařilo odeslat:",
          error
        )
      }
    }

    await logExitChecklistEvent({
      checklistId: offboardingForRemoval.exitChecklist.id,
      action: "UPDATED",
      by: user.id,
      byName: user.name ?? user.email ?? null,
      byEmail: user.email ?? null,
      message: `Zastoupení za ${originalName || originalEmail} osobou ${substituteNameDirect || substituteEmail} bylo zrušeno, odeslána informační zpráva na ${originalEmail}.`,
    })

    return NextResponse.json({ status: "ok" })
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
      exitChecklist: { select: { id: true, header: true, publicToken: true } },
    },
  })

  if (!offboarding || !offboarding.exitChecklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  const header = getHeaderObject(offboarding.exitChecklist.header)
  const existingRecipients = Array.isArray(header.signatureRecipients)
    ? header.signatureRecipients
    : []

  const originalKey = recipientIdentityKey({
    email: originalEmail,
    behalfLabel: originalBehalfLabel || undefined,
  })
  const substituteKey = recipientIdentityKey({
    email: substituteEmail,
    behalfLabel: substituteBehalfLabel || undefined,
  })

  let original = existingRecipients.find(
    (recipient) =>
      recipient &&
      typeof recipient === "object" &&
      recipientIdentityKey(recipient as { email: string }) === originalKey
  ) as { name?: string; email?: string } | undefined

  const substitute = existingRecipients.find(
    (recipient) =>
      recipient &&
      typeof recipient === "object" &&
      recipientIdentityKey(recipient as { email: string }) === substituteKey
  ) as
    | { name?: string; email?: string; position?: string; department?: string }
    | undefined

  if (!substitute) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Náhradník nebyl v seznamu nalezen – nejdřív mu pošlete pozvánku.",
      },
      { status: 404 }
    )
  }

  let recipientsWithOriginal = existingRecipients
  if (!original) {
    original = {
      name: originalName || originalEmail,
      email: originalEmail,
    }
    recipientsWithOriginal = [
      {
        name: original.name,
        email: original.email,
        ...(originalBehalfLabel ? { behalfLabel: originalBehalfLabel } : {}),
      },
      ...existingRecipients,
    ]
  }

  const updatedRecipients = recipientsWithOriginal.map((recipient) =>
    recipient &&
    typeof recipient === "object" &&
    recipientIdentityKey(recipient as { email: string }) === substituteKey
      ? { ...recipient, substituteForKey: originalKey }
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

  const signUrl = offboarding.exitChecklist.publicToken
    ? `${getAppBaseUrl(req)}/odchody-public/${offboarding.exitChecklist.publicToken}`
    : null

  if (signUrl) {
    try {
      const originalEmailNormalized = (original.email ?? originalEmail)
        .trim()
        .toLowerCase()
      const managerEmail = cleanText(header.managerEmail).toLowerCase()
      const sectionBResponsibleHeader = getHeaderObject(
        header.sectionBResponsible
      )
      const sectionBEmail = cleanText(
        sectionBResponsibleHeader.email
      ).toLowerCase()
      const roleNote =
        originalEmailNormalized === managerEmail
          ? EXIT_CHECKLIST_MANAGER_ROLE_NOTE
          : originalEmailNormalized === sectionBEmail
            ? EXIT_CHECKLIST_SECTION_B_ROLE_NOTE
            : null

      await sendSignatureSubstituteNoticeEmail({
        to: original.email ?? originalEmail,
        employeeName,
        employeePosition: offboarding.positionName,
        employeeDepartment: offboarding.department,
        employmentEndDate,
        signUrl,
        substituteName: substitute.name || substituteEmail,
        substitutePosition: substitute.position,
        substituteDepartment: substitute.department,
        roleNote,
      })
    } catch (error) {
      console.error(
        "[SIGNATURE-SUBSTITUTE] E-mail se nepodařilo odeslat:",
        error
      )
    }
  }

  await logExitChecklistEvent({
    checklistId: offboarding.exitChecklist.id,
    action: "UPDATED",
    by: user.id,
    byName: user.name ?? user.email ?? null,
    byEmail: user.email ?? null,
    message: `${original.name ?? originalEmail} bude při podpisu zastupovat ${substitute.name ?? substituteEmail}, odeslána informační zpráva na ${original.email ?? originalEmail}.`,
  })

  return NextResponse.json({ status: "ok" })
}
