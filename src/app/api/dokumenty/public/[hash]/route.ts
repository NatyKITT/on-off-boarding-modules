import { NextRequest, NextResponse } from "next/server"
import { EmploymentDocumentType, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  logEmailHistory,
  sendEmploymentDocumentFilledHrEmail,
  sendEmploymentDocumentFilledPayrollEmail,
} from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { detectIdentityMismatch } from "@/lib/employment-document-identity-check"
import { buildEmploymentDocumentPdf } from "@/lib/employment-document-pdf"
import { recomputeOnboardingReadiness } from "@/lib/onboarding-readiness"

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
          email: true,
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
      {
        message:
          "Dokument je uzamčen pro úpravy. Kontaktujte prosím Personální oddělení.",
      },
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

  const identityMismatches = document.onboarding
    ? detectIdentityMismatch(
        body.type,
        body.data as Record<string, unknown>,
        document.onboarding
      )
    : []

  const updated = await prisma.employmentDocument.update({
    where: { id: document.id },
    data: {
      data: body.data as Prisma.InputJsonValue,
      status: "SIGNED",
      completedAt: now,
      lastEditedBy: `${employeeName} (veřejný odkaz)`,
      lastEditedAt: now,
    },
    select: { id: true },
  })

  if (document.onboarding) {
    await recomputeOnboardingReadiness(document.onboarding.id)
  }

  const mismatchSummary =
    identityMismatches.length > 0
      ? ` NESHODA ÚDAJŮ s nástupem: ${identityMismatches
          .map(
            (m) =>
              `${m.label} (nástup: „${m.expected}“, dotazník: „${m.actual}“)`
          )
          .join("; ")}.`
      : ""

  await logEmploymentDocumentEvent({
    documentId: updated.id,
    action: "FILLED",
    by: null,
    byName: employeeName,
    byEmail: document.onboarding?.userEmail ?? null,
    message: `Zaměstnanec vyplnil dokument přes veřejný odkaz.${mismatchSummary}`,
    meta: identityMismatches.length > 0 ? { identityMismatches } : undefined,
  })

  const hrRecipients = [
    ...(process.env.HR_NOTIFICATION_EMAILS ?? "").split(/[;,]/),
    ...(process.env.HR_EMAILS ?? "").split(/[;,]/),
  ]
    .map((email) => email.trim())
    .filter((email, index, arr) => {
      return (
        email.length > 0 && email.includes("@") && arr.indexOf(email) === index
      )
    })

  const payrollRecipients = (process.env.PAYROLL_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (hrRecipients.length > 0) {
    let hrPdfBuffer: Buffer | null = null
    try {
      const result = await buildEmploymentDocumentPdf(document.id)
      hrPdfBuffer = result?.buffer ?? null
    } catch (error) {
      console.error("HR PDF generation error:", error)
    }

    try {
      const { subject, html } = await sendEmploymentDocumentFilledHrEmail({
        to: hrRecipients,
        employeeName,
        employeePosition: meta?.position,
        employeeDepartment: meta?.department,
        employeeUnitName: meta?.unitName,
        documentTypeLabel: typeText,
        filledAt: now,
        identityMismatches:
          identityMismatches.length > 0 ? identityMismatches : undefined,
        pdfBuffer: hrPdfBuffer,
        pdfFilename: hrPdfBuffer ? `${employeeName}-${typeText}.pdf` : null,
      })

      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: hrRecipients,
        subject,
        content: html,
        status: "SENT",
        createdBy: "public-document-hr",
      })
    } catch (error) {
      console.error("HR notification email failed:", error)
      await logEmailHistory({
        onboardingEmployeeId: document.onboarding?.id,
        emailType: "SYSTEM_NOTIFICATION",
        recipients: hrRecipients,
        subject: `Vyplněný dokument – ${employeeName} – ${typeText}`,
        content: "",
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        createdBy: "public-document-hr",
      })
    }
  }

  if (body.type === "PAYROLL_INFO" && payrollRecipients.length > 0) {
    let pdfBuffer: Buffer | null = null

    try {
      const result = await buildEmploymentDocumentPdf(document.id)
      pdfBuffer = result?.buffer ?? null
    } catch (error) {
      console.error("PDF generation error:", error)
    }

    if (pdfBuffer) {
      try {
        const { subject, html } =
          await sendEmploymentDocumentFilledPayrollEmail({
            to: payrollRecipients,
            employeeName,
            employeePosition: meta?.position,
            employeeDepartment: meta?.department,
            employeeUnitName: meta?.unitName,
            filledAt: now,
            pdfBuffer,
            pdfFilename: `${employeeName}-Dotaznik-mzdova-agenda.pdf`,
          })

        await logEmailHistory({
          onboardingEmployeeId: document.onboarding?.id,
          emailType: "SYSTEM_NOTIFICATION",
          recipients: payrollRecipients,
          subject,
          content: html,
          status: "SENT",
          createdBy: "public-document-payroll",
        })
      } catch (error) {
        console.error("Payroll notification email failed:", error)
        await logEmailHistory({
          onboardingEmployeeId: document.onboarding?.id,
          emailType: "SYSTEM_NOTIFICATION",
          recipients: payrollRecipients,
          subject: `Vyplněný dotazník pro vedení mzdové agendy – ${employeeName}`,
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
        subject: `Vyplněný dotazník pro vedení mzdové agendy – ${employeeName}`,
        content: "",
        status: "FAILED",
        error: "PDF generation failed",
        createdBy: "public-document-payroll",
      })
    }
  }

  return NextResponse.json({ id: updated.id })
}
