import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
import {
  sanitizeKitt6ContactForJson,
  sanitizeResponsiblePersonForJson,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { buildManagerNotifyPromptForChanges } from "@/lib/new-record-manager-watch"
import { canAdminExitChecklist } from "@/lib/rbac"
import { getSession } from "@/lib/session"

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

function toStr(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

async function lookupPositionDepartmentByEmail(
  email: string
): Promise<{ position: string; department: string } | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  try {
    const matches = await getEmployees(email)
    const match = matches.find((m) => normalizeEmail(m.email) === normalized)
    if (!match) return null

    return {
      position: match.positionName || "",
      department: match.department || "",
    }
  } catch {
    return null
  }
}

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

const DEFAULT_SECTION_C_RESPONSIBLE = {
  name: "Vedoucí odboru",
  position: undefined,
  department: undefined,
  email: "",
}

export async function PATCH(
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
      userEmail: true,
      supervisorName: true,
      supervisorEmail: true,
      supervisorPosition: true,
      supervisorDepartment: true,
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

  let supervisorUpdateData: Prisma.EmployeeOffboardingUpdateInput | null = null
  const supervisorChanges: Array<{
    field: string
    oldValue: string
    newValue: string
  }> = []

  let employeeEmailUpdateData: Prisma.EmployeeOffboardingUpdateInput | null =
    null
  const employeeEmailChanges: Array<{
    field: string
    oldValue: string
    newValue: string
  }> = []

  if ("employeeEmail" in body) {
    const employeeEmail =
      typeof body.employeeEmail === "string" ? body.employeeEmail.trim() : ""
    changedParts.push(`e-mail zaměstnance: ${employeeEmail || "—"}`)

    if (
      normalizeEmail(employeeEmail) !== normalizeEmail(offboarding.userEmail)
    ) {
      employeeEmailChanges.push({
        field: "userEmail",
        oldValue: toStr(offboarding.userEmail),
        newValue: employeeEmail,
      })
      employeeEmailUpdateData = { userEmail: employeeEmail || null }
    }
  }

  if ("managerEmail" in body) {
    const managerEmail =
      typeof body.managerEmail === "string" ? body.managerEmail.trim() : ""
    const managerName =
      typeof body.managerName === "string" ? body.managerName.trim() : ""
    let managerPosition =
      typeof body.managerPosition === "string"
        ? body.managerPosition.trim()
        : ""
    let managerDepartment =
      typeof body.managerDepartment === "string"
        ? body.managerDepartment.trim()
        : ""

    if (!managerPosition && !managerDepartment && managerEmail) {
      const found = await lookupPositionDepartmentByEmail(managerEmail)
      if (found) {
        managerPosition = found.position
        managerDepartment = found.department
      }
    }

    nextHeaderRecord.managerEmail = managerEmail || null
    nextHeaderRecord.managerName = managerName || null
    nextHeaderRecord.managerPosition = managerPosition || null
    nextHeaderRecord.managerDepartment = managerDepartment || null
    changedParts.push(`vedoucí odboru: ${managerEmail || "—"}`)

    // Vedoucí odboru ve výstupním listu je stejný vedoucí jako na záznamu
    // odchodu jako celku – změna se propíše i tam (včetně oznámení o změně
    // vedoucího, pokud už mu dřív chodila informace k tomuto záznamu).
    if (
      normalizeEmail(managerEmail) !==
      normalizeEmail(offboarding.supervisorEmail)
    ) {
      const supervisorFields: Record<string, string | null> = {
        supervisorName: managerName || null,
        supervisorEmail: managerEmail || null,
        supervisorPosition: managerPosition || null,
        supervisorDepartment: managerDepartment || null,
      }

      const beforeRec: Record<string, unknown> = {
        supervisorName: offboarding.supervisorName,
        supervisorEmail: offboarding.supervisorEmail,
        supervisorPosition: offboarding.supervisorPosition,
        supervisorDepartment: offboarding.supervisorDepartment,
      }

      for (const [field, newValue] of Object.entries(supervisorFields)) {
        const oldStr = toStr(beforeRec[field])
        const newStr = toStr(newValue)
        if (oldStr !== newStr) {
          supervisorChanges.push({ field, oldValue: oldStr, newValue: newStr })
        }
      }

      supervisorUpdateData = {
        ...supervisorFields,
        supervisorManualOverride: true,
      }
    }
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

  if ("sectionCResponsible" in body) {
    const sectionCResponsible = sanitizeResponsiblePersonForJson(
      body.sectionCResponsible,
      DEFAULT_SECTION_C_RESPONSIBLE
    )
    nextHeaderRecord.sectionCResponsible = sectionCResponsible
    changedParts.push(
      `odpovědná osoba za sekci C – předání agendy: ${(sectionCResponsible as unknown as { email: string }).email}`
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

  await prisma.$transaction(async (tx) => {
    await tx.exitChecklist.update({
      where: { id: offboarding.exitChecklist!.id },
      data: { header: nextHeader },
    })

    if (supervisorUpdateData) {
      await tx.employeeOffboarding.update({
        where: { id: offboardingId },
        data: supervisorUpdateData,
      })

      for (const change of supervisorChanges) {
        await tx.offboardingChangeLog.create({
          data: {
            employeeId: offboardingId,
            userId: user.id,
            action: "UPDATED",
            field: change.field,
            oldValue: change.oldValue || null,
            newValue: change.newValue || null,
          },
        })
      }
    }

    if (employeeEmailUpdateData) {
      await tx.employeeOffboarding.update({
        where: { id: offboardingId },
        data: employeeEmailUpdateData,
      })

      for (const change of employeeEmailChanges) {
        await tx.offboardingChangeLog.create({
          data: {
            employeeId: offboardingId,
            userId: user.id,
            action: "UPDATED",
            field: change.field,
            oldValue: change.oldValue || null,
            newValue: change.newValue || null,
          },
        })
      }
    }
  })

  await logExitChecklistEvent({
    checklistId: offboarding.exitChecklist.id,
    action: "UPDATED",
    by: user.id,
    byName: user.name ?? user.email ?? null,
    byEmail: user.email ?? null,
    message: `Upraveny odpovědné osoby: ${changedParts.join("; ")}.`,
  })

  const managerNotifyPrompt =
    supervisorChanges.length > 0
      ? await buildManagerNotifyPromptForChanges({
          kind: "OFFBOARDING",
          recordId: offboardingId,
          changes: supervisorChanges,
        })
      : null

  return NextResponse.json({ status: "ok", managerNotifyPrompt })
}
