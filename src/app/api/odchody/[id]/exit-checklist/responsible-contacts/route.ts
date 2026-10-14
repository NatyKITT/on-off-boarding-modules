import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  sanitizeKitt6ContactForJson,
  sanitizeResponsiblePersonForJson,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getHeaderObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const DEFAULT_SECTION_B_RESPONSIBLE = {
  name: "Ing. Martina Krýzová",
  position: "vedoucí Oddělení vnitřní správy",
  department: "Odbor služeb",
  email: "mkryzova@praha6.cz",
}

export async function PATCH(
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
        message: "Nemáte oprávnění upravovat odpovědné osoby.",
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

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!body) {
    return NextResponse.json(
      { status: "error", message: "Neplatná data." },
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

  if (!offboarding || !offboarding.exitChecklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  const header = getHeaderObject(offboarding.exitChecklist.header)

  const nextHeaderRecord: Record<string, unknown> = { ...header }
  const changedParts: string[] = []

  if ("managerEmail" in body) {
    const managerEmail =
      typeof body.managerEmail === "string" ? body.managerEmail.trim() : ""
    const managerName =
      typeof body.managerName === "string" ? body.managerName.trim() : ""
    const managerPosition =
      typeof body.managerPosition === "string"
        ? body.managerPosition.trim()
        : ""
    const managerDepartment =
      typeof body.managerDepartment === "string"
        ? body.managerDepartment.trim()
        : ""
    nextHeaderRecord.managerEmail = managerEmail || null
    nextHeaderRecord.managerName = managerName || null
    nextHeaderRecord.managerPosition = managerPosition || null
    nextHeaderRecord.managerDepartment = managerDepartment || null
    changedParts.push(`vedoucí odboru (sekce C): ${managerEmail || "—"}`)
  }

  if ("sectionBResponsible" in body) {
    const sectionBResponsible = sanitizeResponsiblePersonForJson(
      body.sectionBResponsible,
      DEFAULT_SECTION_B_RESPONSIBLE
    )
    nextHeaderRecord.sectionBResponsible = sectionBResponsible
    changedParts.push(
      `odpovědná osoba za sekci B: ${(sectionBResponsible as unknown as { email: string }).email}`
    )
  }

  if ("kitt6OptionContact" in body) {
    const kitt6OptionContact = sanitizeKitt6ContactForJson(
      body.kitt6OptionContact
    )
    nextHeaderRecord.kitt6OptionContact = kitt6OptionContact
    changedParts.push(
      `kontakt KITT6: ${(kitt6OptionContact as unknown as { email: string }).email}`
    )
  }

  if (changedParts.length === 0) {
    return NextResponse.json(
      { status: "error", message: "Nebyla zadána žádná změna." },
      { status: 400 }
    )
  }

  const nextHeader = nextHeaderRecord as Prisma.InputJsonObject

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
    message: `Upraveny odpovědné osoby: ${changedParts.join("; ")}.`,
  })

  return NextResponse.json({ status: "ok" })
}
