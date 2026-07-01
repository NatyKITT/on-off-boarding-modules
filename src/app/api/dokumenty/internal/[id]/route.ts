import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  canManageEmploymentDocuments,
  canReadEmploymentDocuments,
} from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Params {
  params: { id: string }
}

export async function GET(_: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění zobrazit dokument." },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { message: "Neplatné ID dokumentu." },
      { status: 400 }
    )
  }

  const doc = await prisma.employmentDocument.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      data: true,
      isLocked: true,
      completedAt: true,
      expiresAt: true,
      onboarding: {
        select: {
          name: true,
          surname: true,
        },
      },
    },
  })

  if (!doc) {
    return NextResponse.json(
      { message: "Dokument nebyl nalezen." },
      { status: 404 }
    )
  }

  return NextResponse.json({ document: doc })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění upravovat dokument." },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { message: "Neplatné ID dokumentu." },
      { status: 400 }
    )
  }

  const existing = await prisma.employmentDocument.findUnique({
    where: { id },
    select: {
      id: true,
      isLocked: true,
    },
  })

  if (!existing) {
    return NextResponse.json(
      { message: "Dokument nebyl nalezen." },
      { status: 404 }
    )
  }

  if (existing.isLocked) {
    return NextResponse.json(
      { message: "Dokument je uzamčený. Nejdříve ho odemkněte." },
      { status: 423 }
    )
  }

  try {
    const body = await req.json().catch(() => null)

    if (!body || typeof body !== "object" || !("data" in body)) {
      return NextResponse.json(
        { message: "Neplatná data dokumentu." },
        { status: 400 }
      )
    }

    const jsonData = body.data as Prisma.InputJsonValue

    const doc = await prisma.employmentDocument.update({
      where: { id },
      data: {
        data: jsonData,
        status: DocumentStatus.COMPLETED,
        completedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        type: true,
        isLocked: true,
      },
    })

    return NextResponse.json({ document: doc })
  } catch (error) {
    console.error("PATCH /api/dokumenty/internal/[id] error", error)

    return NextResponse.json(
      { message: "Uložení dokumentu se nezdařilo." },
      { status: 500 }
    )
  }
}
