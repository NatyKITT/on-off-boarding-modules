import { randomBytes } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { canManageEmploymentDocuments } from "@/lib/rbac"
import { absoluteUrl } from "@/lib/url"

const assignSchema = z.object({
  onboardingId: z.number().int(),
  documentType: z.nativeEnum(EmploymentDocumentType),
})

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canManageEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění vytvářet dokumenty." },
      { status: 403 }
    )
  }

  const parsed = assignSchema.safeParse(await req.json().catch(() => null))

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const { onboardingId, documentType } = parsed.data

  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: {
      id: onboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  const accessHash = randomBytes(16).toString("hex")
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)

  const doc = await prisma.employmentDocument.create({
    data: {
      onboardingId,
      type: documentType,
      status: "DRAFT",
      data: {},
      accessHash,
      expiresAt,
    },
  })

  const publicUrl = absoluteUrl(`/dokumenty/${accessHash}`, req)

  return NextResponse.json({
    id: doc.id,
    accessUrl: publicUrl,
    expiresAt: expiresAt.toISOString(),
  })
}
