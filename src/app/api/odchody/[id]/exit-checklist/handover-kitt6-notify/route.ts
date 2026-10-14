import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { sendHandoverKitt6Email } from "@/lib/email"
import {
  isPraha6OrKitt6,
  resolveHandoverOption2Target,
  sanitizeKitt6ContactForResponse,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAccessInternalApp, canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function normalizeEmail(value?: string | null): string {
  return sanitizeText(value).toLowerCase()
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
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      positionName: true,
      department: true,
      unitName: true,
      actualEnd: true,
      plannedEnd: true,
      exitChecklist: { select: { id: true, header: true, lockedAt: true } },
    },
  })

  if (!offboarding || !offboarding.exitChecklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  if (offboarding.exitChecklist.lockedAt) {
    return NextResponse.json(
      {
        status: "error",
        message: "Výstupní list je uzamčený.",
      },
      { status: 423 }
    )
  }

  const header = getHeaderObject(offboarding.exitChecklist.header)
  const managerEmail = sanitizeText(header.managerEmail)
  const managerName = sanitizeText(header.managerName) || null
  const managerPosition = sanitizeText(header.managerPosition) || null
  const managerDepartment = sanitizeText(header.managerDepartment) || null

  const isInternalAdmin =
    canAccessInternalApp(role) && canAdminExitChecklist(role)
  const isManagerVisitor =
    Boolean(user.email) &&
    Boolean(managerEmail) &&
    normalizeEmail(user.email) === normalizeEmail(managerEmail) &&
    Boolean(user.email && isPraha6OrKitt6(user.email))

  if (!isInternalAdmin && !isManagerVisitor) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění odesílat tuto informaci.",
      },
      { status: 403 }
    )
  }

  const handover = getHeaderObject(header.handover)

  if (!handover.option2) {
    return NextResponse.json(
      {
        status: "error",
        message: "V sekci C není vybraná volba předání na KITT6.",
      },
      { status: 400 }
    )
  }

  const targetPosition = resolveHandoverOption2Target(handover)

  if (!targetPosition) {
    return NextResponse.json(
      {
        status: "error",
        message: "Chybí vybrané cílové funkční místo.",
      },
      { status: 400 }
    )
  }

  const body = await req.json().catch(() => null)
  const force =
    body && typeof body === "object" && (body as { force?: unknown }).force
      ? true
      : false

  const existingNotifiedAt = sanitizeText(handover.handoverNotifiedAt)
  const existingNotifiedTarget = sanitizeText(handover.handoverNotifiedTarget)
  const existingNotifiedTo = sanitizeText(handover.handoverNotifiedTo)

  if (
    !force &&
    existingNotifiedAt &&
    existingNotifiedTarget === targetPosition
  ) {
    return NextResponse.json(
      {
        status: "error",
        code: "ALREADY_SENT",
        message: "Informace pro aktuální volbu už byla odeslána.",
        sentAt: existingNotifiedAt,
        sentTo: existingNotifiedTo,
      },
      { status: 409 }
    )
  }

  const kitt6Contact = sanitizeKitt6ContactForResponse(
    header.kitt6OptionContact
  )

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
    await sendHandoverKitt6Email({
      to: kitt6Contact.email,
      employeeName,
      employeePosition: offboarding.positionName,
      employeeDepartment: [offboarding.department, offboarding.unitName]
        .filter(Boolean)
        .join(" – "),
      employmentEndDate,
      targetPosition,
      managerName,
      managerPosition,
      managerDepartment,
    })
  } catch (error) {
    console.error("[HANDOVER-KITT6-NOTIFY] Odeslání se nezdařilo:", error)
    return NextResponse.json(
      { status: "error", message: "Nepodařilo se odeslat informaci." },
      { status: 500 }
    )
  }

  const notifiedAt = new Date().toISOString()
  const nextHeader: Prisma.InputJsonObject = {
    ...(header as Prisma.InputJsonObject),
    handover: {
      ...(handover as Prisma.InputJsonObject),
      handoverNotifiedAt: notifiedAt,
      handoverNotifiedTo: kitt6Contact.email,
      handoverNotifiedTarget: targetPosition,
    },
  }

  await prisma.exitChecklist.update({
    where: { id: offboarding.exitChecklist.id },
    data: { header: nextHeader },
  })

  await logExitChecklistEvent({
    checklistId: offboarding.exitChecklist.id,
    action: "UPDATED",
    by: user.id ?? null,
    byName: user.name ?? user.email ?? null,
    byEmail: user.email ?? null,
    message: `Informace o předání agendy na KITT6 odeslána na ${kitt6Contact.email} (cílové místo: ${targetPosition}).`,
  })

  return NextResponse.json({ status: "ok", sentTo: kitt6Contact.email })
}
