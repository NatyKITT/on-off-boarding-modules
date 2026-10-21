import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { performManagerChangeNotification } from "@/lib/new-record-manager-watch"
import {
  buildFullName,
  getAppBaseUrlFromRequest,
} from "@/lib/probation-evaluation-request"
import { canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

const bodySchema = z.object({
  reason: z.enum([
    "FIELDS_CHANGED",
    "MANAGER_CHANGED",
    "RECORD_CANCELLED",
    "RECORD_DELETED",
  ]),
})

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canWriteOffboarding(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění upravovat záznam odchodu.",
      },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const raw = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)

  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const record = await prisma.employeeOffboarding.findFirst({
    where: { id },
  })

  if (!record) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"
  const userName = session.user.name ?? session.user.email ?? userKey

  const baseUrl = getAppBaseUrlFromRequest(request)

  const result = await performManagerChangeNotification({
    kind: "OFFBOARDING",
    recordId: id,
    reason: parsed.data.reason,
    current: {
      employeeName: buildFullName(record),
      employeePersonalNumber: record.personalNumber,
      employeePosition: record.positionName,
      employeeDepartment: record.department,
      employeeUnitName: record.unitName,
      plannedDate: record.plannedEnd?.toISOString() ?? null,
      supervisorEmail: record.supervisorEmail,
      recordLink: `${baseUrl}/odchody/${record.id}`,
    },
    createdBy: userKey,
    createdByName: userName,
  })

  return NextResponse.json({ status: "success", ...result })
}
