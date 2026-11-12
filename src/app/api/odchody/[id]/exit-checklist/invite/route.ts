import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"

import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"
import {
  EXIT_CHECKLIST_SIGNATORIES,
  LAW_SIGNATORY,
} from "@/config/exit-checklist-signatories"

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
  resolveExitChecklistPendingItems,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import {
  recipientIdentityKey,
  roleSubstituteKey,
} from "@/lib/exit-checklist-recipient-key"
import {
  EXIT_CHECKLIST_MANAGER_HEADER_SUBTITLE,
  EXIT_CHECKLIST_MANAGER_ROLE_NOTE,
  EXIT_CHECKLIST_SECTION_B_ROLE_NOTE,
} from "@/lib/exit-checklist-role-notes"
import { canAdminExitChecklist } from "@/lib/rbac"

export const dynamic = "force-dynamic"

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

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

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (key): key is string => typeof key === "string" && key.trim() !== ""
      )
    : []
}

type AggEntry = {
  name: string
  rowKeys: string[]
  position: string | null
  department: string | null
  id?: string | null
  isManager?: boolean
  isSectionB?: boolean
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
  const recipientId =
    cleanText((body as Record<string, unknown>).recipientId) || null
  const rowKeys = cleanStringArray((body as Record<string, unknown>).rowKeys)
  const isBehalf = (body as Record<string, unknown>).isBehalf === true
  const behalfOf = cleanText((body as Record<string, unknown>).behalfOf)
  const behalfOfName = cleanText((body as Record<string, unknown>).behalfOfName)
  const behalfOfRole = cleanText((body as Record<string, unknown>).behalfOfRole)
  const behalfOfDisplayLabel = cleanText(
    (body as Record<string, unknown>).behalfOfDisplayLabel
  )
  const behalfOfPosition =
    cleanText((body as Record<string, unknown>).behalfOfPosition) || null
  const behalfOfDepartment =
    cleanText((body as Record<string, unknown>).behalfOfDepartment) || null
  const behalfOfEmail =
    cleanText((body as Record<string, unknown>).behalfOfEmail).toLowerCase() ||
    null
  const behalfOfRowKeys = cleanStringArray(
    (body as Record<string, unknown>).behalfOfRowKeys
  )
  const substituteName = cleanText(
    (body as Record<string, unknown>).substituteName
  )
  const substituteEmail =
    cleanText(
      (body as Record<string, unknown>).substituteEmail
    ).toLowerCase() || null
  const substitutePosition =
    cleanText((body as Record<string, unknown>).substitutePosition) || null
  const substituteDepartment =
    cleanText((body as Record<string, unknown>).substituteDepartment) || null

  const alsoActingOnBehalfOfRaw = (body as Record<string, unknown>)
    .alsoActingOnBehalfOf
  const alsoActingOnBehalfOfList = (
    Array.isArray(alsoActingOnBehalfOfRaw)
      ? alsoActingOnBehalfOfRaw
      : alsoActingOnBehalfOfRaw &&
          typeof alsoActingOnBehalfOfRaw === "object" &&
          !Array.isArray(alsoActingOnBehalfOfRaw)
        ? [alsoActingOnBehalfOfRaw]
        : []
  )
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object"
    )
    .map((entry) => ({
      id: cleanText(entry.id) || null,
      behalfOfName: cleanText(entry.behalfOfName),
      behalfOfDisplayLabel: cleanText(entry.behalfOfDisplayLabel),
      behalfOfPosition: cleanText(entry.behalfOfPosition) || null,
      behalfOfDepartment: cleanText(entry.behalfOfDepartment) || null,
      behalfOfRowKeys: cleanStringArray(entry.behalfOfRowKeys),
    }))
    .filter((entry) => entry.behalfOfName || entry.behalfOfDisplayLabel)

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
      exitChecklist: {
        include: { items: true, assets: true },
      },
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

  // Zaměstnanec (odcházející) smí podepsat jen svůj vlastní podpis v
  // hlavičce – jeho e-mail nikdy nesmí nést agendu sekce A ani zastoupení.
  if (
    isEmployeeInvite &&
    (rowKeys.length > 0 || isBehalf || alsoActingOnBehalfOfList.length > 0)
  ) {
    return NextResponse.json(
      {
        error:
          "Zaměstnanci nelze přiřadit žádnou další agendu ani zastoupení – smí podepsat jen svůj vlastní podpis v hlavičce.",
      },
      { status: 400 }
    )
  }

  const header = getHeaderObject(checklist.header)
  const managerEmail = cleanText(header.managerEmail).toLowerCase()
  const sectionBResponsibleHeader = getHeaderObject(header.sectionBResponsible)
  const sectionBEmail = cleanText(sectionBResponsibleHeader.email).toLowerCase()
  const isManager = Boolean(managerEmail) && inviteeEmail === managerEmail
  const isSectionB = Boolean(sectionBEmail) && inviteeEmail === sectionBEmail

  function resolveKnownSignatoryRowKeys(email: string): string[] {
    const knownSignatory =
      EXIT_CHECKLIST_SIGNATORIES.find((signatory) =>
        signatory.emails.some(
          (signatoryEmail) => signatoryEmail.toLowerCase() === email
        )
      ) ??
      (LAW_SIGNATORY.emails.some(
        (signatoryEmail) => signatoryEmail.toLowerCase() === email
      )
        ? LAW_SIGNATORY
        : null)

    if (!knownSignatory) return []

    return knownSignatory.rowKeys.filter(
      (key) => key !== "lawInfo" || Boolean(header.conflictOfInterest)
    )
  }

  function resolveRoleNote(email: string | null): string | null {
    if (!email) return null
    if (email === managerEmail) return EXIT_CHECKLIST_MANAGER_ROLE_NOTE
    if (email === sectionBEmail) return EXIT_CHECKLIST_SECTION_B_ROLE_NOTE
    return null
  }

  const headerSignatures = getHeaderObject(header.signatures)
  const headerHandoverManagerSignature = getHeaderObject(
    header.handoverManagerSignature
  )
  const commonPendingArgs = {
    employeeSignedAt: cleanText(
      getHeaderObject(headerSignatures.employee).signedAt
    ),
    managerSignedAt: cleanText(
      getHeaderObject(headerSignatures.manager).signedAt
    ),
    issuerSignedAt: cleanText(
      getHeaderObject(headerSignatures.issuer).signedAt
    ),
    handoverManagerSignedAt: cleanText(headerHandoverManagerSignature.signedAt),
    assetsComplete:
      Boolean(header.noAssets) || (checklist.assets?.length ?? 0) > 0,
    items: EXIT_CHECKLIST_ROWS.map((row) => ({
      key: row.key,
      obligation: row.obligation,
      signedAt: checklist.items.find((item) => item.key === row.key)?.signedAt,
    })),
  }

  // Sečtení agendy podle e-mailu: stejný e-mail může dnes (nebo po tomto
  // volání) pokrývat víc karet v "Seznam a správa osob" – ať pod různými
  // jmény, nebo ve víc zástupných rolích zároveň. Pozvánka se odesílá
  // JEDNOU na daný e-mail, s agendou sečtenou ze všech jeho karet, ne jedna
  // pozvánka po kartě. Stejný princip jako cronové připomínky
  // (queueExitChecklistSignatureReminders v offboarding-cron-jobs.ts).
  const existingRecipientsRaw = Array.isArray(header.signatureRecipients)
    ? (header.signatureRecipients as Array<Record<string, unknown>>)
    : []

  const directCandidates: AggEntry[] = []
  const behalfCandidates: AggEntry[] = []

  const managerKey = managerEmail
    ? recipientIdentityKey({ email: managerEmail, behalfLabel: undefined })
    : null
  const sectionBKey = sectionBEmail
    ? recipientIdentityKey({ email: sectionBEmail, behalfLabel: undefined })
    : null

  if (isBehalf) {
    behalfCandidates.push({
      name:
        behalfOfDisplayLabel || behalfOfName || behalfOf || "zodpovědnou osobu",
      rowKeys: behalfOfRowKeys,
      position: behalfOfPosition,
      department: behalfOfDepartment,
      id: recipientId,
      isManager: Boolean(managerEmail) && behalfOfEmail === managerEmail,
      isSectionB: Boolean(sectionBEmail) && behalfOfEmail === sectionBEmail,
    })
  } else {
    directCandidates.push({
      name: inviteeName || inviteeEmail,
      rowKeys,
      position: null,
      department: null,
      id: recipientId,
    })
  }
  // Další zástupné vazby pro TENTO e-mail, nově přidávané ve stejném
  // odeslání (ať je hlavní karta přímá, nebo sama zástupná) – typicky jeden
  // zástup za víc různých lidí najednou.
  for (const extra of alsoActingOnBehalfOfList) {
    behalfCandidates.push({
      name: extra.behalfOfDisplayLabel || extra.behalfOfName,
      rowKeys: extra.behalfOfRowKeys,
      position: extra.behalfOfPosition,
      department: extra.behalfOfDepartment,
      id: extra.id,
    })
  }

  for (const existing of existingRecipientsRaw) {
    const existingEmail = cleanText(existing.email).toLowerCase()
    if (existingEmail !== inviteeEmail) continue
    if (existing.revokedAt) continue
    if (recipientId && existing.id === recipientId) continue

    const existingSubstituteForKey = cleanText(existing.substituteForKey)
    const entry: AggEntry = {
      name: cleanText(existing.name) || existingEmail,
      rowKeys: cleanStringArray(existing.rowKeys),
      position: cleanText(existing.position) || null,
      department: cleanText(existing.department) || null,
      isManager:
        Boolean(existingSubstituteForKey) &&
        (existingSubstituteForKey === managerKey ||
          existingSubstituteForKey === roleSubstituteKey("manager")),
      isSectionB:
        Boolean(existingSubstituteForKey) &&
        (existingSubstituteForKey === sectionBKey ||
          existingSubstituteForKey === roleSubstituteKey("sectionB")),
    }

    if (cleanText(existing.behalfLabel)) {
      behalfCandidates.push(entry)
    } else {
      directCandidates.push(entry)
    }
  }

  const hasDirect = directCandidates.length > 0
  const directRowKeysFinal = Array.from(
    new Set([
      ...directCandidates.flatMap((entry) => entry.rowKeys),
      ...resolveKnownSignatoryRowKeys(inviteeEmail),
    ])
  )

  const behalfGroups = new Map<
    string,
    {
      name: string
      rowKeys: Set<string>
      position: string | null
      department: string | null
      isManager: boolean
      isSectionB: boolean
    }
  >()
  for (const entry of behalfCandidates) {
    const key = entry.name.trim().toLowerCase()
    if (!key) continue
    let group = behalfGroups.get(key)
    if (!group) {
      group = {
        name: entry.name,
        rowKeys: new Set(),
        position: entry.position,
        department: entry.department,
        isManager: false,
        isSectionB: false,
      }
      behalfGroups.set(key, group)
    }
    entry.rowKeys.forEach((rowKey) => group!.rowKeys.add(rowKey))
    if (!group.position && entry.position) group.position = entry.position
    if (!group.department && entry.department)
      group.department = entry.department
    if (entry.isManager) group.isManager = true
    if (entry.isSectionB) group.isSectionB = true
  }
  const behalfEntries = Array.from(behalfGroups.values()).map((group) => ({
    name: group.name,
    rowKeys: Array.from(group.rowKeys),
    position: group.position,
    department: group.department,
    isManager: group.isManager,
    isSectionB: group.isSectionB,
  }))

  try {
    if (isEmployeeInvite) {
      await sendEmployeeExitChecklistInviteEmail({
        to: inviteeEmail,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
      })
    } else if (hasDirect) {
      await sendSignatureInviteEmail({
        to: inviteeEmail,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
        roleNote: resolveRoleNote(inviteeEmail),
        pendingItems: resolveExitChecklistPendingItems({
          isEmployee: false,
          isManager,
          isSectionB,
          rowKeys: directRowKeysFinal,
          ...commonPendingArgs,
        }),
        headerSubtitle: isManager
          ? EXIT_CHECKLIST_MANAGER_HEADER_SUBTITLE
          : null,
        substituteInfo: substituteName
          ? {
              name: substituteName,
              email: substituteEmail,
              position: substitutePosition,
              department: substituteDepartment,
            }
          : null,
        alsoActingOnBehalfOf:
          behalfEntries.length > 0
            ? behalfEntries.map((entry) => ({
                name: entry.name,
                email: null,
                position: entry.position,
                department: entry.department,
                obligations: resolveExitChecklistPendingItems({
                  isEmployee: false,
                  isManager: entry.isManager,
                  isSectionB: entry.isSectionB,
                  rowKeys: entry.rowKeys,
                  ...commonPendingArgs,
                }),
              }))
            : null,
      })
    } else if (behalfEntries.length > 0) {
      const [primaryBehalf, ...restBehalf] = behalfEntries

      await sendBehalfSignatureEmail({
        to: inviteeEmail,
        behalfOfName: primaryBehalf.name,
        behalfOfRole,
        behalfOfDisplayLabel: primaryBehalf.name,
        behalfOfPosition: primaryBehalf.position,
        behalfOfDepartment: primaryBehalf.department,
        roleNote: resolveRoleNote(behalfOfEmail),
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
        obligations: resolveExitChecklistPendingItems({
          isEmployee: false,
          isManager: primaryBehalf.isManager,
          isSectionB: primaryBehalf.isSectionB,
          rowKeys: primaryBehalf.rowKeys,
          ...commonPendingArgs,
        }),
        additionalBehalfEntries:
          restBehalf.length > 0
            ? restBehalf.map((entry) => ({
                name: entry.name,
                position: entry.position,
                department: entry.department,
                obligations: resolveExitChecklistPendingItems({
                  isEmployee: false,
                  isManager: entry.isManager,
                  isSectionB: entry.isSectionB,
                  rowKeys: entry.rowKeys,
                  ...commonPendingArgs,
                }),
              }))
            : undefined,
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
    const combinedRolesSuffix =
      alsoActingOnBehalfOfList.length > 0
        ? ` (sečtená agenda, zároveň v zastoupení za ${alsoActingOnBehalfOfList
            .map((entry) => entry.behalfOfDisplayLabel || entry.behalfOfName)
            .join(", ")})`
        : ""

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

      const nowIso = new Date().toISOString()
      const additions: Array<Record<string, unknown>> = [
        {
          ...(recipientId ? { id: recipientId } : {}),
          name: inviteeName || inviteeEmail,
          email: inviteeEmail,
          invitedAt: nowIso,
          ...(isBehalf && behalfOfRowKeys.length
            ? { rowKeys: behalfOfRowKeys }
            : {}),
          ...(!isBehalf && rowKeys.length ? { rowKeys } : {}),
          ...(isBehalf && behalfLabel ? { behalfLabel } : {}),
        },
        ...alsoActingOnBehalfOfList.map((extra) => ({
          ...(extra.id ? { id: extra.id } : {}),
          name: extra.behalfOfName || extra.behalfOfDisplayLabel || "Zástup",
          email: inviteeEmail,
          invitedAt: nowIso,
          rowKeys: extra.behalfOfRowKeys,
          behalfLabel: extra.behalfOfDisplayLabel || extra.behalfOfName,
        })),
      ]

      const mergedRecipients = mergeSignatureRecipients(
        Array.isArray(header.signatureRecipients)
          ? header.signatureRecipients
          : [],
        additions
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
        ? `Pozvánka k podpisu v zastoupení za „${behalfLabel}" byla odeslána na adresu ${inviteeEmail}${nameSuffix}. Přidáno do seznamu příjemců k podpisu.`
        : `Pozvánka k podpisu byla odeslána na adresu ${inviteeEmail}${nameSuffix}${combinedRolesSuffix}. Přidáno do seznamu příjemců k podpisu.`,
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
