import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  logEmailHistory,
  sendBehalfSignatureEmail,
  sendEmployeeExitChecklistInviteEmail,
  sendSignatureInviteEmail,
} from "@/lib/email"
import {
  getOrCreateChecklist,
  mergeSignatureRecipients,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAdminExitChecklist } from "@/lib/rbac"

export const dynamic = "force-dynamic"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Nejste přihlášen." }, { status: 401 })
  }

  if (!canAdminExitChecklist(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění odesílat pozvánky k podpisu." },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (!Number.isFinite(offboardingId)) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 })
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const inviteeEmail = cleanText(
    (body as Record<string, unknown>).inviteeEmail
  ).toLowerCase()
  const inviteeName = cleanText((body as Record<string, unknown>).inviteeName)
  const isBehalf = (body as Record<string, unknown>).isBehalf === true
  const behalfOf = cleanText((body as Record<string, unknown>).behalfOf)
  const behalfOfName = cleanText((body as Record<string, unknown>).behalfOfName)
  const behalfOfRole = cleanText((body as Record<string, unknown>).behalfOfRole)
  const behalfOfDisplayLabel = cleanText(
    (body as Record<string, unknown>).behalfOfDisplayLabel
  )
  const behalfOfRowKeysRaw = (body as Record<string, unknown>).behalfOfRowKeys
  const behalfOfRowKeys = Array.isArray(behalfOfRowKeysRaw)
    ? behalfOfRowKeysRaw.filter(
        (key): key is string => typeof key === "string" && key.trim() !== ""
      )
    : []

  if (!inviteeEmail) {
    return NextResponse.json(
      { error: "E-mailová adresa příjemce je povinná." },
      { status: 400 }
    )
  }

  if (!isValidEmail(inviteeEmail)) {
    return NextResponse.json(
      { error: "Zadaná e-mailová adresa není platná." },
      { status: 400 }
    )
  }

  if (isBehalf && !behalfOf && !behalfOfName && !behalfOfDisplayLabel) {
    return NextResponse.json(
      { error: "Vyberte, za koho bude příjemce podepisovat." },
      { status: 400 }
    )
  }

  const offboarding = await prisma.employeeOffboarding.findFirst({
    where: {
      id: offboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
      personalNumber: true,
      positionName: true,
      department: true,
      unitName: true,
      actualEnd: true,
      plannedEnd: true,
      userEmail: true,
      exitChecklist: true,
    },
  })

  if (!offboarding) {
    return NextResponse.json(
      { error: "Záznam odchodu nebyl nalezen." },
      { status: 404 }
    )
  }

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
    : "—"

  let checklist = offboarding.exitChecklist

  if (!checklist) {
    const ensured = await getOrCreateChecklist(offboarding.id)
    checklist = ensured?.checklist ?? null
  }

  if (!checklist) {
    return NextResponse.json(
      { error: "Výstupní list se nepodařilo vytvořit." },
      { status: 500 }
    )
  }

  if (!checklist.publicToken) {
    return NextResponse.json(
      { error: "Výstupní list nemá veřejný token pro podpis." },
      { status: 500 }
    )
  }

  const signUrl = `${getAppBaseUrl(req)}/odchody-public/${checklist.publicToken}`

  const isEmployeeInvite =
    Boolean(offboarding.userEmail) &&
    inviteeEmail === offboarding.userEmail?.trim().toLowerCase()

  try {
    if (isBehalf) {
      await sendBehalfSignatureEmail({
        to: inviteeEmail,
        behalfOfName: behalfOfName || behalfOf || "zodpovědnou osobu",
        behalfOfRole,
        behalfOfDisplayLabel: behalfOfDisplayLabel || behalfOf || undefined,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
      })
    } else if (isEmployeeInvite) {
      await sendEmployeeExitChecklistInviteEmail({
        to: inviteeEmail,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
      })
    } else {
      await sendSignatureInviteEmail({
        to: inviteeEmail,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
      })
    }

    await logEmailHistory({
      offboardingEmployeeId: offboarding.id,
      emailType: isBehalf
        ? "EXIT_CHECKLIST_BEHALF_SIGNATURE"
        : "EXIT_CHECKLIST_SIGNATURE_INVITE",
      recipients: [inviteeEmail],
      subject: `Pozvánka k podpisu výstupního listu – ${employeeName}`,
      content: signUrl,
      status: "SENT",
      createdBy: session.user.id ?? session.user.email ?? "unknown",
    })

    const behalfLabel = behalfOfDisplayLabel || behalfOfName || behalfOf
    const nameSuffix = inviteeName ? ` (${inviteeName})` : ""

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.exitChecklist.findUnique({
        where: { id: checklist.id },
        select: { header: true },
      })

      const headerRaw = fresh?.header ?? checklist.header
      const header =
        headerRaw && typeof headerRaw === "object" && !Array.isArray(headerRaw)
          ? (headerRaw as Record<string, unknown>)
          : {}

      const mergedRecipients = mergeSignatureRecipients(
        Array.isArray(header.signatureRecipients)
          ? header.signatureRecipients
          : [],
        [
          {
            name: inviteeName || inviteeEmail,
            email: inviteeEmail,
            invitedAt: new Date().toISOString(),
            ...(isBehalf && behalfOfRowKeys.length
              ? { rowKeys: behalfOfRowKeys }
              : {}),
            ...(isBehalf && behalfLabel ? { behalfLabel } : {}),
          },
        ]
      )

      await tx.exitChecklist.update({
        where: { id: checklist.id },
        data: {
          header: {
            ...(header as Prisma.InputJsonObject),
            signatureRecipients:
              mergedRecipients as unknown as Prisma.InputJsonValue,
            signatureRecipientsSentAt: new Date().toISOString(),
            signatureRecipientsSentByName:
              session.user.name ?? session.user.email ?? null,
            signatureRecipientsSentByEmail: session.user.email ?? null,
          },
        },
      })
    })

    await logExitChecklistEvent({
      checklistId: checklist.id,
      action: "SIGNATURE_INVITE_SENT",
      by: session.user.id ?? null,
      byName: session.user.name ?? session.user.email ?? null,
      byEmail: session.user.email ?? null,
      message: isBehalf
        ? `Pozvánka k podpisu v zastoupení za „${behalfLabel}" byla odeslána na adresu ${inviteeEmail}${nameSuffix}. Přidán(a) do seznamu příjemců k podpisu.`
        : `Pozvánka k podpisu byla odeslána na adresu ${inviteeEmail}${nameSuffix}. Přidán(a) do seznamu příjemců k podpisu.`,
    })
  } catch (error) {
    console.error(
      "[exit-checklist/invite] E-mail se nepodařilo odeslat:",
      error
    )

    await logExitChecklistEvent({
      checklistId: checklist.id,
      action: "EMAIL_FAILED",
      by: session.user.id ?? null,
      byName: session.user.name ?? session.user.email ?? null,
      byEmail: session.user.email ?? null,
      message: `Odeslání pozvánky k podpisu na adresu ${inviteeEmail} se nezdařilo.`,
    })

    return NextResponse.json(
      {
        error: "E-mail se nepodařilo odeslat. Zkopírujte odkaz ručně.",
        signUrl,
      },
      { status: 207 }
    )
  }

  return NextResponse.json({
    status: "ok",
    message: `Pozvánka k podpisu byla odeslána na adresu ${inviteeEmail}.`,
    signUrl,
  })
}
