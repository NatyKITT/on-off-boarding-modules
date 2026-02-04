import { randomBytes } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { DocumentStatus, Prisma, Role } from "@prisma/client"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: { id: string } }
type SessionUserWithRole = { role?: Role }

function canRegenerate(role?: Role) {
  return role === "ADMIN" || role === "HR"
}

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

  const role = (session.user as SessionUserWithRole).role
  if (!canRegenerate(role)) {
    return NextResponse.json({ message: "Nemáte oprávnění." }, { status: 403 })
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
    select: { id: true, isLocked: true },
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

      return NextResponse.json({ document: updated })
    } catch (e) {
      lastError = e
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
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
