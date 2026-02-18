import { NextRequest, NextResponse } from "next/server"
import { EmploymentDocumentType, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import { logEmailHistory, sendMail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const allowedTypes: EmploymentDocumentType[] = [
  EmploymentDocumentType.AFFIDAVIT,
  EmploymentDocumentType.PERSONAL_QUESTIONNAIRE,
  EmploymentDocumentType.PAYROLL_INFO,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { hash: string } }
) {
  const hash = params.hash

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (
    !body ||
    typeof body.documentId !== "number" ||
    !Number.isFinite(body.documentId) ||
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
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          department: true,
          unitName: true,
          positionName: true,
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

  const meta = document.onboarding
    ? buildEmployeeMeta(document.onboarding)
    : undefined

  const employeeName = meta?.fullName ?? "neznámý zaměstnanec"
  const typeText = docTypeLabel(body.type)

  const updated = await prisma.employmentDocument.update({
    where: { id: document.id },
    data: {
      data: body.data as Prisma.InputJsonValue,
      status: "SIGNED",
      completedAt: now,
    },
    select: { id: true },
  })

  const hrRecipients = (process.env.HR_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const payrollRecipients = (process.env.PAYROLL_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const subject = `Vyplněný dokument – ${employeeName} – ${typeText}`

  if (hrRecipients.length > 0) {
    const htmlHR = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2 style="margin: 0 0 10px 0;">Vyplněný dokument</h2>

        <p style="margin: 0 0 12px 0;">
          Dobrý den,<br/>
          zaměstnanec <strong>${employeeName}</strong> právě vyplnil dokument typu
          <strong>${typeText}</strong>.
        </p>

        ${
          meta?.position || meta?.department || meta?.unitName
            ? `<p style="margin: 0 0 12px 0; color: #374151;">
                ${meta?.position ? `<strong>Pozice:</strong> ${meta.position}<br/>` : ""}
                ${meta?.department || meta?.unitName ? `<strong>Oddělení / Útvar:</strong> ${[meta?.department, meta?.unitName].filter(Boolean).join(" / ")}` : ""}
              </p>`
            : ""
        }

        <p style="margin: 0 0 12px 0; color: #374151;">
          <strong>Datum a čas vyplnění:</strong> ${now.toLocaleString("cs-CZ")}
        </p>

        <p style="margin: 0 0 12px 0;">
          Dokument je k dispozici v interní aplikaci v detailu nástupu.
        </p>

        <p style="margin: 0; color: #6b7280; font-size: 12px;">
          Tento e-mail byl automaticky vygenerován systémem On-Boarding Modul ÚMČ Praha 6.
        </p>
      </div>
    `

    try {
      await sendMail({ to: hrRecipients, subject, html: htmlHR })
      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: hrRecipients,
        subject,
        content: htmlHR,
        status: "SENT",
        createdBy: "public-document-hr",
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
        createdBy: "public-document-hr",
      })
    }
  }

  if (body.type === "PAYROLL_INFO" && payrollRecipients.length > 0) {
    let pdfBuffer: ArrayBuffer | null = null

    try {
      const origin = (process.env.AUTH_URL ?? "http://localhost:3001").replace(
        /\/$/,
        ""
      )
      const pdfUrl = `${origin}/api/dokumenty/public/${hash}/pdf`
      const pdfResponse = await fetch(pdfUrl)

      if (pdfResponse.ok) {
        pdfBuffer = await pdfResponse.arrayBuffer()
      } else {
        console.warn("PDF generation failed:", pdfResponse.status)
      }
    } catch (error) {
      console.error("PDF generation error:", error)
    }

    if (pdfBuffer) {
      const htmlPayroll = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h2 style="margin: 0 0 10px 0;">Vyplněný dotazník pro mzdovou agendu</h2>

          <p style="margin: 0 0 12px 0;">
            Dobrý den,<br/>
            zaměstnanec <strong>${employeeName}</strong> vyplnil <strong>Dotazník pro vedení mzdové agendy</strong>.
          </p>

          ${
            meta?.position || meta?.department || meta?.unitName
              ? `<p style="margin: 0 0 12px 0; color: #374151;">
                  ${meta?.position ? `<strong>Pozice:</strong> ${meta.position}<br/>` : ""}
                  ${meta?.department || meta?.unitName ? `<strong>Oddělení / Útvar:</strong> ${[meta?.department, meta?.unitName].filter(Boolean).join(" / ")}` : ""}
                </p>`
              : ""
          }

          <p style="margin: 0 0 12px 0; color: #374151;">
            <strong>Datum vyplnění:</strong> ${now.toLocaleString("cs-CZ")}
          </p>

          <p style="margin: 0 0 12px 0;">
            Vyplněný dokument je přiložen k tomuto e-mailu ve formátu PDF.
          </p>

          <p style="margin: 0; color: #6b7280; font-size: 12px;">
            Tento e-mail byl automaticky vygenerován systémem On-Boarding Modul ÚMČ Praha 6.
          </p>
        </div>
      `

      try {
        await sendMail({
          to: payrollRecipients,
          subject: `Vyplněný dotazník pro mzdovou agendu – ${employeeName}`,
          html: htmlPayroll,
          attachments: [
            {
              filename: `${employeeName}-Dotaznik-mzdova-agenda.pdf`,
              content: Buffer.from(pdfBuffer),
              contentType: "application/pdf",
            },
          ],
        })

        await logEmailHistory({
          onboardingEmployeeId: document.onboarding?.id,
          emailType: "SYSTEM_NOTIFICATION",
          recipients: payrollRecipients,
          subject: `Vyplněný dotazník pro mzdovou agendu – ${employeeName}`,
          content: htmlPayroll,
          status: "SENT",
          createdBy: "public-document-payroll",
        })
      } catch (error) {
        console.error("Payroll notification email failed:", error)
        await logEmailHistory({
          onboardingEmployeeId: document.onboarding?.id,
          emailType: "SYSTEM_NOTIFICATION",
          recipients: payrollRecipients,
          subject: `Vyplněný dotazník pro mzdovou agendu – ${employeeName}`,
          content: "",
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          createdBy: "public-document-payroll",
        })
      }
    } else {
      console.error("Payroll email skipped: PDF generation failed")
      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: payrollRecipients,
        subject: `Vyplněný dotazník pro mzdovou agendu – ${employeeName}`,
        content: "",
        status: "FAILED",
        error: "PDF generation failed",
        createdBy: "public-document-payroll",
      })
    }
  }

  return NextResponse.json({ id: updated.id })
}
