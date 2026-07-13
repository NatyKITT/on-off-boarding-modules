import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type HistoryEvent = {
  id: number
  employeeId: number
  userId: string
  displayUser: string
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
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

  try {
    const record = await prisma.employeeChange.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        personalNumber: true,
        type: true,
        status: true,
        effectiveDate: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        deletedBy: true,
        emailSentAt: true,
        emailSentBy: true,
        EmailHistory: {
          select: {
            id: true,
            emailType: true,
            subject: true,
            status: true,
            sentAt: true,
            createdBy: true,
            createdAt: true,
            recipients: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!record) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    const events: HistoryEvent[] = []
    let syntheticId = 1

    events.push({
      id: syntheticId++,
      employeeId: id,
      userId: "system",
      displayUser: "Systém",
      action: "CREATE",
      field: "initial_creation",
      oldValue: null,
      newValue: JSON.stringify({
        name: `${record.name} ${record.surname}`,
        personalNumber: record.personalNumber,
        type: record.type,
        effectiveDate: record.effectiveDate.toISOString(),
      }),
      createdAt: record.createdAt.toISOString(),
    })

    if (record.updatedAt.getTime() !== record.createdAt.getTime()) {
      events.push({
        id: syntheticId++,
        employeeId: id,
        userId: "system",
        displayUser: "Systém",
        action: "UPDATE",
        field: "updated_at",
        oldValue: null,
        newValue: record.updatedAt.toISOString(),
        createdAt: record.updatedAt.toISOString(),
      })
    }

    for (const email of record.EmailHistory) {
      const userDisplay = await resolveUserDisplay(email.createdBy)

      events.push({
        id: syntheticId++,
        employeeId: id,
        userId: email.createdBy,
        displayUser: userDisplay,
        action: "MAIL_SENT",
        field: "email",
        oldValue: null,
        newValue: JSON.stringify({
          type: email.emailType,
          subject: email.subject,
          status: email.status,
          recipients: email.recipients,
        }),
        createdAt: (email.sentAt ?? email.createdAt).toISOString(),
      })
    }

    if (record.deletedAt) {
      const userDisplay = await resolveUserDisplay(record.deletedBy)

      events.push({
        id: syntheticId++,
        employeeId: id,
        userId: record.deletedBy ?? "unknown",
        displayUser: userDisplay,
        action: "DELETE",
        field: "deleted_at",
        oldValue: null,
        newValue: record.deletedAt.toISOString(),
        createdAt: record.deletedAt.toISOString(),
      })
    }

    events.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    return NextResponse.json({
      status: "success",
      data: events,
      summary: {
        total: events.length,
        actionTypes: Array.from(new Set(events.map((event) => event.action))),
        infoOnly: true,
      },
    })
  } catch (err) {
    console.error("GET /api/zmeny/[id]/history error:", err)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst historii." },
      { status: 500 }
    )
  }
}

async function resolveUserDisplay(userId?: string | null): Promise<string> {
  if (!userId) return "Systém"

  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: userId }] },
      select: { name: true, surname: true, email: true },
    })

    if (user?.name && user?.surname) return `${user.name} ${user.surname}`
    if (user?.email) return user.email
  } catch {}

  return userId
}
