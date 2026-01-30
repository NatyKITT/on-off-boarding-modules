import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const id = Number(params.id)
  if (Number.isNaN(id)) {
    return NextResponse.json(
      { message: "Neplatné ID dokumentu." },
      { status: 400 }
    )
  }

  try {
    const body = await req.json()
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
      },
    })

    return NextResponse.json(doc)
  } catch (error) {
    console.error("PATCH /api/dokumenty/internal/[id] error", error)
    return NextResponse.json(
      { message: "Uložení dokumentu se nezdařilo." },
      { status: 500 }
    )
  }
}
