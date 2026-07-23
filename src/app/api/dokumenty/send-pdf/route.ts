import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { EMAIL_FOOTER_HTML, logEmailHistory, sendMail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { buildEmploymentDocumentPdf } from "@/lib/employment-document-pdf"
import { canManageEmploymentDocuments } from "@/lib/rbac"

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

  if (!canManageEmploymentDocuments(session.user.role)) {
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

  const subject = employeeName
    ? `Vyplněné dokumenty k nástupu – ${employeeName}`
    : "Vyplněné dokumenty k nástupu"

  const departmentText = meta.department?.trim()
  const unitNameText = meta.unitName?.trim()
  const positionText = meta.position?.trim()

  const infoBlock =
    departmentText || unitNameText || positionText
      ? `
        <div style="margin: 12px 0 0 0; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-size: 12px; color: #374151;">
            ${
              positionText
                ? `<div><strong>Pozice:</strong> ${positionText}</div>`
                : ""
            }
            ${
              departmentText
                ? `<div><strong>Odbor:</strong> ${departmentText}</div>`
                : ""
            }
            ${
              unitNameText
                ? `<div><strong>Oddělení:</strong> ${unitNameText}</div>`
                : ""
            }
          </div>
        </div>
      `
      : ""

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 10px 0;">Vyplněné dokumenty k nástupu</h2>

      <p style="margin: 0 0 12px 0;">
        Dobrý den,<br/>
        personální oddělení Vám zasílá vyplněné dokumenty zaměstnance
        <strong>${employeeName || "—"}</strong> – viz údaje níže.
      </p>

      ${infoBlock}

      <ul style="padding-left: 18px; margin: 14px 0 14px 0;">
        ${attachments.map((att) => `<li style="margin: 6px 0;">${att.filename.replace(/\.pdf$/, "")}</li>`).join("")}
      </ul>

      <p style="margin: 0 0 4px 0;">
        Dokumenty naleznete v příloze tohoto e-mailu ve formátu PDF.
      </p>

      <p style="margin: 14px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
        ${EMAIL_FOOTER_HTML}
      </p>
    </div>
  `

  await sendMail({
    to: [email],
    subject,
    html,
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

  return NextResponse.json({
    ok: true,
    sentTo: email,
    documentIds: docsFromDb.map((document) => document.id),
  })
}
