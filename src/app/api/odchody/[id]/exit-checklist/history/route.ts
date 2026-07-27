import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canEditInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canEditInternalApp(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit historii výstupního listu.",
      },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (!Number.isFinite(offboardingId)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID odchodu." },
      { status: 400 }
    )
  }

  const checklist = await prisma.exitChecklist.findUnique({
    where: { offboardingId },
    select: { id: true },
  })

  if (!checklist) {
    return NextResponse.json({ status: "success", data: [] })
  }

  const events = await prisma.exitChecklistEvent.findMany({
    where: { checklistId: checklist.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    status: "success",
    data: events.map((event) => ({
      id: event.id,
      action: event.action,
      by: event.byName || event.byEmail || event.by || null,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  })
}
