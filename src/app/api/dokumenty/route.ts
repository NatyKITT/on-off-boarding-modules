import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
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

  const baseUrl = process.env.AUTH_URL ?? req.nextUrl.origin

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
    },
    orderBy: { createdAt: "desc" },
  })

  const docsWithUrl = documents.map((d) => ({
    ...d,
    publicUrl: d.accessHash ? `${baseUrl}/dokumenty/${d.accessHash}` : null,
  }))

  return NextResponse.json({ documents: docsWithUrl })
}
