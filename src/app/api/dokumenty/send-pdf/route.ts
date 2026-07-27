import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { logEmailHistory, sendEmploymentDocumentPdfEmail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { buildEmploymentDocumentPdf } from "@/lib/employment-document-pdf"
import { canSendEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const postSchema = z.object({
  onboardingId: z.number().int(),
  email: z.string().email(),
  documentIds: z.array(z.number().int()).min(1),
})

function docTypeLabel(t: EmploymentDocumentType) {
  switch (t) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "PAYROLL_INFO":
      return "Dotazník pro vedení mzdové agendy"
    default:
      return t
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canSendEmploymentDocuments(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění odesílat dokumenty." },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const { onboardingId, email, documentIds } = parsed.data

  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: {
      id: onboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      personalNumber: true,
      department: true,
      unitName: true,
      positionName: true,
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  const meta = buildEmployeeMeta(onboarding)
  const employeeName =
    meta.fullName || `${onboarding.name} ${onboarding.surname}`.trim()

  const docsFromDb = await prisma.employmentDocument.findMany({
    where: {
      id: { in: documentIds },
      onboardingId,
      status: { not: "DRAFT" },
    },
    select: { id: true, type: true },
  })

  if (!docsFromDb.length) {
    return NextResponse.json(
      {
        message:
          "Vybrané dokumenty nejsou vyplněné, nelze u nich vygenerovat PDF.",
      },
      { status: 400 }
    )
  }

  const attachments = (
    await Promise.all(
      docsFromDb.map(async (document) => {
        const built = await buildEmploymentDocumentPdf(document.id)

        if (!built) return null

        return {
          filename: `${docTypeLabel(document.type)}.pdf`,
          content: built.buffer,
          contentType: "application/pdf",
        }
      })
    )
  ).filter(Boolean) as Array<{
    filename: string
    content: Buffer
    contentType: string
  }>

  if (!attachments.length) {
    return NextResponse.json(
      { message: "PDF se nepodařilo vygenerovat." },
      { status: 500 }
    )
  }

  const { subject, html } = await sendEmploymentDocumentPdfEmail({
    to: email,
    employeeName,
    employeePersonalNumber: onboarding.personalNumber,
    employeePosition: meta.position,
    employeeDepartment: meta.department,
    employeeUnitName: meta.unitName,
    documentLabels: attachments.map((att) =>
      att.filename.replace(/\.pdf$/, "")
    ),
    attachments,
  })

  const sentBy = session.user.name ?? session.user.email ?? "unknown"

  await logEmailHistory({
    onboardingEmployeeId: onboardingId,
    emailType: "MANUAL_EMAIL",
    recipients: [email],
    subject,
    content: html,
    status: "SENT",
    createdBy: sentBy,
  })

  await Promise.all(
    docsFromDb.map((document) =>
      logEmploymentDocumentEvent({
        documentId: document.id,
        action: "PDF_SENT",
        by: (session.user as { id?: string }).id ?? null,
        byName: sentBy,
        byEmail: email,
        message: `PDF dokumentu bylo odesláno e-mailem na adresu ${email}.`,
      })
    )
  )

  return NextResponse.json({
    ok: true,
    sentTo: email,
    documentIds: docsFromDb.map((document) => document.id),
  })
}
