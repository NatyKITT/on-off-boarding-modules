import { randomBytes } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { canManageEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }

function createHash() {
  return randomBytes(16).toString("hex")
}

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
      { message: "Nemáte oprávnění obnovit odkaz dokumentu." },
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

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await prisma.employmentDocument.update({
        where: { id },
        data: {
          accessHash: createHash(),
          expiresAt,
          status: DocumentStatus.DRAFT,
          completedAt: null,
          fileUrl: null,
          isLocked: false,
          data: {} as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          type: true,
          status: true,
          createdAt: true,
          completedAt: true,
          isLocked: true,
          accessHash: true,
          expiresAt: true,
        },
      })

      await logEmploymentDocumentEvent({
        documentId: updated.id,
        action: "REGENERATED",
        by: (session.user as { id?: string }).id ?? null,
        byName: session.user.name ?? session.user.email ?? null,
        byEmail: session.user.email ?? null,
        message: "Byl obnoven přístupový odkaz na dokument.",
      })

      return NextResponse.json({ document: updated })
    } catch (error) {
      lastError = error

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        continue
      }

      break
    }
  }

  console.error("Regenerate failed:", lastError)

  return NextResponse.json(
    { message: "Obnovení odkazu se nezdařilo." },
    { status: 500 }
  )
}
