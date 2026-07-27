import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { logEmailHistory, sendEmploymentDocumentLinkEmail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { canManageEmploymentDocuments } from "@/lib/rbac"
import { absoluteUrl } from "@/lib/url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const postSchema = z.object({
  onboardingId: z.number().int(),
  email: z.string().email(),
  documents: z
    .array(
      z.object({
        id: z.number().int(),
        type: z.nativeEnum(EmploymentDocumentType),
        url: z.string().optional(),
      })
    )
    .min(1),
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
      { message: "Nemáte oprávnění odesílat odkazy na dokumenty." },
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

  const { onboardingId, email, documents } = parsed.data
  const ids = documents.map((document) => document.id)

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
      email: true,
      userEmail: true,
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

  const now = new Date()

  const docsFromDb = await prisma.employmentDocument.findMany({
    where: {
      id: { in: ids },
      onboardingId,
    },
    select: {
      id: true,
      type: true,
      accessHash: true,
      status: true,
      expiresAt: true,
      isLocked: true,
    },
  })

  const mapped = docsFromDb
    .filter((document) => {
      if (!document.accessHash) return false
      if (document.isLocked) return false
      if (document.status !== "DRAFT") return false
      if (document.expiresAt && document.expiresAt < now) return false

      return true
    })
    .map((document) => ({
      id: document.id,
      type: document.type,
      url: absoluteUrl(`/dokumenty/${document.accessHash}`, req),
      label: docTypeLabel(document.type),
    }))

  if (!mapped.length) {
    return NextResponse.json(
      {
        message:
          "Vybrané dokumenty nejsou připravené k odeslání. Zkontrolujte, že mají veřejný odkaz, nejsou uzamčené, nejsou vyplněné a nevypršely.",
      },
      { status: 400 }
    )
  }

  const { subject, html } = await sendEmploymentDocumentLinkEmail({
    to: email,
    employeeName,
    employeePersonalNumber: onboarding.personalNumber,
    employeePosition: meta.position,
    employeeDepartment: meta.department,
    employeeUnitName: meta.unitName,
    documents: mapped.map((document) => ({
      label: document.label,
      url: document.url,
    })),
  })

  const sentBy = session.user.name ?? session.user.email ?? "unknown"
  const sentAt = new Date()

  await Promise.all([
    logEmailHistory({
      onboardingEmployeeId: onboardingId,
      emailType: "MANUAL_EMAIL",
      recipients: [email],
      subject,
      content: html,
      status: "SENT",
      createdBy: session.user.id ?? session.user.email ?? "unknown",
    }),
    prisma.employmentDocument.updateMany({
      where: { id: { in: mapped.map((document) => document.id) } },
      data: { sentAt, sentBy },
    }),
    ...mapped.map((document) =>
      logEmploymentDocumentEvent({
        documentId: document.id,
        action: "SENT",
        by: (session.user as { id?: string }).id ?? null,
        byName: sentBy,
        byEmail: email,
        message: `Odkaz na dokument byl odeslán na e-mail ${email}.`,
      })
    ),
  ])

  return NextResponse.json({
    ok: true,
    sentTo: email,
    documentIds: mapped.map((document) => document.id),
  })
}
