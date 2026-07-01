import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canReadEmploymentDocuments } from "@/lib/rbac"

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění zobrazit dokumenty." },
      { status: 403 }
    )
  }

  const onboardingIdParam = req.nextUrl.searchParams.get("onboardingId")
  const onboardingId = onboardingIdParam ? Number(onboardingIdParam) : NaN

  if (!onboardingIdParam || Number.isNaN(onboardingId)) {
    return NextResponse.json(
      { message: "Neplatný parametr onboardingId." },
      { status: 400 }
    )
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin
  ).replace(/\/$/, "")

  const documents = await prisma.employmentDocument.findMany({
    where: { onboardingId },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      completedAt: true,
      fileUrl: true,
      accessHash: true,
      isLocked: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const docsWithUrl = documents.map((document) => ({
    ...document,
    publicUrl: document.accessHash
      ? `${baseUrl}/dokumenty/${document.accessHash}`
      : null,
  }))

  return NextResponse.json({ documents: docsWithUrl })
}
