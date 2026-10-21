import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canReadEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getNumericId(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
  }

  if (!canReadEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění zobrazit tento dokument." },
      { status: 403 }
    )
  }

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) {
    return NextResponse.json(
      { message: "Neplatné ID nástupu." },
      { status: 400 }
    )
  }

  const latest = await prisma.medicalExamSignedFile.findFirst({
    where: { onboardingId },
    orderBy: { uploadedAt: "desc" },
    select: { fileName: true, fileData: true },
  })

  if (!latest) {
    return NextResponse.json(
      { message: "Podepsaná žádost ještě nebyla nahrána." },
      { status: 404 }
    )
  }

  return new Response(new Uint8Array(latest.fileData), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${latest.fileName}"`,
      "Cache-Control": "no-store",
    },
  })
}
