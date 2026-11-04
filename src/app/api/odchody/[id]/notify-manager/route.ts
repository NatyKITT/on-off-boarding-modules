import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  findLatestManagerNoticeInfo,
  queueManagerAssignedNotice,
} from "@/lib/new-record-manager-watch"
import {
  buildFullName,
  getAppBaseUrlFromRequest,
} from "@/lib/probation-evaluation-request"
import { canWriteOffboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

export async function GET(_request: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const info = await findLatestManagerNoticeInfo("OFFBOARDING", id)

  return NextResponse.json({
    status: "success",
    alreadySent: info !== null,
    lastSentAt: info?.sentAt ?? null,
    lastSentBy: info?.sentBy ?? null,
  })
}

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

  const record = await prisma.employeeOffboarding.findFirst({
    where: { id },
  })

  if (!record) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }

  if (!record.supervisorEmail) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "U tohoto záznamu není zadaný vedoucí odboru, komu by se informace odeslala.",
      },
      { status: 400 }
    )
  }

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"
  const userName = session.user.name ?? session.user.email ?? userKey

  const baseUrl = getAppBaseUrlFromRequest(request)

  await queueManagerAssignedNotice({
    kind: "OFFBOARDING",
    recordId: record.id,
    managerEmail: record.supervisorEmail,
    employeeName: buildFullName(record),
    employeePersonalNumber: record.personalNumber,
    employeePosition: record.positionName,
    employeeDepartment: record.department,
    employeeUnitName: record.unitName,
    plannedDate: record.plannedEnd?.toISOString() ?? null,
    recordLink: `${baseUrl}/odchody/${record.id}`,
    createdBy: userKey,
    createdByName: userName,
  })

  return NextResponse.json({
    status: "success",
    message: "Informace o odchodu byla odeslána vedoucímu odboru.",
  })
}
