import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
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
        message: "Nemáte oprávnění upravovat výstupní list.",
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
  const value = (body as Record<string, unknown> | null)?.value

  if (typeof value !== "boolean") {
    return NextResponse.json(
      { status: "error", message: "Chybí hodnota rozhodnutí." },
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

  const nextHeader: Prisma.InputJsonObject = {
    ...(header as Prisma.InputJsonObject),
    conflictOfInterest: value,
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
    message: `Rozhodnuto o střetu zájmů: ${value ? "ano" : "ne"} (ze seznamu osob k podpisu).`,
  })

  return NextResponse.json({ status: "ok", conflictOfInterest: value })
}
