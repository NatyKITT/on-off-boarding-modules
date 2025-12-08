import { NextRequest, NextResponse } from "next/server"
import { EmploymentDocumentType, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { logEmailHistory, sendMail } from "@/lib/email"

const allowedTypes: EmploymentDocumentType[] = [
  EmploymentDocumentType.AFFIDAVIT,
  EmploymentDocumentType.PERSONAL_QUESTIONNAIRE,
  EmploymentDocumentType.EDUCATION,
  EmploymentDocumentType.EXPERIENCE,
]

function isEmploymentDocumentType(
  value: unknown
): value is EmploymentDocumentType {
  return (
    typeof value === "string" &&
    allowedTypes.includes(value as EmploymentDocumentType)
  )
}

type PatchBody = {
  documentId: number
  type: EmploymentDocumentType
  data: unknown
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { hash: string } }
) {
  const hash = params.hash
  const body = (await req.json().catch(() => null)) as PatchBody | null

  if (
    !body ||
    typeof body.documentId !== "number" ||
    !isEmploymentDocumentType(body.type) ||
    body.data == null
  ) {
    return NextResponse.json(
      { message: "Neplatná data formuláře." },
      { status: 400 }
    )
  }

  const document = await prisma.employmentDocument.findFirst({
    where: {
      id: body.documentId,
      accessHash: hash,
      type: body.type,
    },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      isLocked: true,
      onboarding: {
        select: {
          id: true,
          name: true,
          surname: true,
          userEmail: true,
        },
      },
    },
  })

  if (!document) {
    return NextResponse.json(
      { message: "Dokument nebyl nalezen." },
      { status: 404 }
    )
  }

  const now = new Date()

  if (document.expiresAt && document.expiresAt < now) {
    return NextResponse.json(
      { message: "Odkaz na dokument již vypršel." },
      { status: 410 }
    )
  }

  if (document.isLocked) {
    return NextResponse.json(
      { message: "Dokument je uzamčen pro úpravy. Kontaktujte prosím HR." },
      { status: 423 }
    )
  }

  if (document.status !== "DRAFT") {
    return NextResponse.json(
      { message: "Dokument je již vyplněný." },
      { status: 409 }
    )
  }

  const updated = await prisma.employmentDocument.update({
    where: { id: document.id },
    data: {
      data: body.data as Prisma.InputJsonValue,
      status: "SIGNED",
      completedAt: now,
    },
  })

  const hrEnv = process.env.HR_NOTIFICATION_EMAILS ?? ""
  const hrRecipients = hrEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (hrRecipients.length > 0) {
    const employeeName = document.onboarding
      ? `${document.onboarding.name} ${document.onboarding.surname}`.trim()
      : "neznámý zaměstnanec"

    const subject = `Vyplněný dokument – ${employeeName}`

    const html = `
      <p>Dobrý den,</p>
      <p>zaměstnanec <strong>${employeeName}</strong> právě vyplnil dokument typu
         <strong>${body.type}</strong>.</p>
      <p>Datum a čas vyplnění: <strong>${now.toLocaleString("cs-CZ")}</strong>.</p>
      <p>Dokument je k dispozici v interní aplikaci v detailu nástupu.</p>
    `

    try {
      await sendMail({
        to: hrRecipients,
        subject,
        html,
      })

      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: hrRecipients,
        subject,
        content: html,
        status: "SENT",
        createdBy: "public-document",
      })
    } catch (error) {
      console.error("HR notification email failed:", error)
      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: hrRecipients,
        subject,
        content: "",
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        createdBy: "public-document",
      })
    }
  }

  return NextResponse.json({ id: updated.id })
}
