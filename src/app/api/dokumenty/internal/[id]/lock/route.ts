import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

interface Params {
  params: { id: string }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ message: "Neplatné ID." }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as {
    locked?: boolean
  } | null
  if (!body || typeof body.locked !== "boolean") {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const doc = await prisma.employmentDocument.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!doc) {
    return NextResponse.json(
      { message: "Dokument nenalezen." },
      { status: 404 }
    )
  }

  const updated = await prisma.employmentDocument.update({
    where: { id },
    data: { isLocked: body.locked },
    select: { id: true, isLocked: true },
  })

  return NextResponse.json({ document: updated })
}
