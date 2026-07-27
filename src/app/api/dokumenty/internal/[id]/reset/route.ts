import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

export async function PATCH(_req: NextRequest, { params }: Params) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění resetovat dokument." },
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

  const updated = await prisma.employmentDocument.update({
    where: { id },
    data: {
      data: {} as Prisma.InputJsonValue,
      status: DocumentStatus.DRAFT,
      completedAt: null,
      fileUrl: null,
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      type: true,
      isLocked: true,
    },
  })

  await logEmploymentDocumentEvent({
    documentId: updated.id,
    action: "RESET",
    by: (session.user as { id?: string }).id ?? null,
    byName: session.user.name ?? session.user.email ?? null,
    byEmail: session.user.email ?? null,
    message: "Data dokumentu byla vymazána, dokument vrácen do stavu konceptu.",
  })

  return NextResponse.json({ document: updated })
}
