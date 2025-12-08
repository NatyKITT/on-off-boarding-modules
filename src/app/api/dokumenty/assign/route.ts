import { randomBytes } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"

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

  const json = await req.json()
  const { onboardingId, documentType } = assignSchema.parse(json)

  const accessHash = randomBytes(16).toString("hex")
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  const baseUrl = process.env.NEXTAUTH_URL ?? req.nextUrl.origin

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

  const publicUrl = `${baseUrl}/dokumenty/${accessHash}`

  return NextResponse.json({
    id: doc.id,
    accessUrl: publicUrl,
    expiresAt: expiresAt.toISOString(),
  })
}
