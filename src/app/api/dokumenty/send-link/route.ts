import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { logEmailHistory, sendEmploymentDocumentLinkEmail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { logEmploymentDocumentEvent } from "@/lib/employment-document-events"
import { recomputeOnboardingReadiness } from "@/lib/onboarding-readiness"
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
    .default([]),
  includeMedicalExam: z.boolean().optional().default(false),
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
    return NextResponse.json({ message: "Nejste přihlášeni." }, { status: 401 })
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

  const { onboardingId, email, documents, includeMedicalExam } = parsed.data
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
      medicalExamJobTitle: true,
      medicalExamJobDescription: true,
      medicalExamWorkCategory: true,
      medicalExamType: true,
      medicalExamExamReason: true,
      medicalExamVariant: true,
      medicalExamAppointmentAt: true,
      medicalExamSelfArranged: true,
      documentsReadinessStatus: true,
      documents: {
        where: { type: "PERSONAL_QUESTIONNAIRE" },
        select: { completedAt: true },
        take: 1,
      },
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  if (onboarding.documentsReadinessStatus === "LOCKED") {
    return NextResponse.json(
      {
        message:
          "Nástupní dokumenty jsou uzamčené jako hotové. Nejdřív je odemkněte.",
      },
      { status: 423 }
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

  const skipped: { label: string; reason: string }[] = []

  const mapped = docsFromDb
    .filter((document) => {
      const label = docTypeLabel(document.type)

      if (!document.accessHash) {
        skipped.push({ label, reason: "chybí veřejný odkaz" })
        return false
      }
      if (document.isLocked) {
        skipped.push({ label, reason: "dokument je uzamčený" })
        return false
      }
      if (document.status !== "DRAFT") {
        skipped.push({ label, reason: "dokument je již vyplněný" })
        return false
      }
      if (document.expiresAt && document.expiresAt < now) {
        skipped.push({
          label,
          reason: `platnost odkazu vypršela ${document.expiresAt.toLocaleDateString("cs-CZ")} – obnovte ho tlačítkem "Nový odkaz"`,
        })
        return false
      }

      return true
    })
    .map((document) => ({
      id: document.id,
      type: document.type,
      url: absoluteUrl(`/dokumenty/${document.accessHash}`, req),
      label: docTypeLabel(document.type),
    }))

  if (!mapped.length && !includeMedicalExam) {
    const detail = skipped
      .map((item) => `${item.label} – ${item.reason}`)
      .join("; ")

    return NextResponse.json(
      {
        message: detail
          ? `Vybrané dokumenty nejsou připravené k odeslání: ${detail}.`
          : "Vybrané dokumenty nejsou připravené k odeslání.",
      },
      { status: 400 }
    )
  }

  let medicalExamAttachment:
    | {
        variant: "ULZ" | "OWN_DOCTOR"
        appointmentAt: string | null
        selfArranged: boolean
        attachment: { filename: string; content: Buffer }
      }
    | undefined

  if (includeMedicalExam) {
    if (!onboarding.documents[0]?.completedAt) {
      return NextResponse.json(
        {
          message:
            "Žádost o pracovnělékařskou prohlídku lze přiložit až po vyplnění osobního dotazníku zaměstnancem.",
        },
        { status: 400 }
      )
    }

    if (
      !onboarding.medicalExamJobTitle ||
      !onboarding.medicalExamJobDescription ||
      !onboarding.medicalExamWorkCategory ||
      !onboarding.medicalExamType ||
      !onboarding.medicalExamVariant
    ) {
      return NextResponse.json(
        {
          message:
            "Nejdřív v záložce „Lékařská prohlídka“ vyplňte pracovní zařazení, druh práce, kategorii práce, druh prohlídky a variantu vstupní prohlídky.",
        },
        { status: 400 }
      )
    }

    if (
      onboarding.medicalExamType !== "vstupní" &&
      !onboarding.medicalExamExamReason
    ) {
      return NextResponse.json(
        {
          message:
            "U zvoleného druhu prohlídky je potřeba vyplnit důvod k jejímu provedení.",
        },
        { status: 400 }
      )
    }

    const signedFile = await prisma.medicalExamSignedFile.findFirst({
      where: { onboardingId },
      orderBy: { uploadedAt: "desc" },
      select: { fileName: true, fileData: true },
    })

    if (!signedFile) {
      return NextResponse.json(
        {
          message:
            "Nejdřív nahrajte podepsanou a orazítkovanou žádost o pracovnělékařskou prohlídku.",
        },
        { status: 400 }
      )
    }

    medicalExamAttachment = {
      variant: onboarding.medicalExamVariant,
      appointmentAt: onboarding.medicalExamAppointmentAt?.toISOString() ?? null,
      selfArranged: onboarding.medicalExamSelfArranged,
      attachment: {
        filename: signedFile.fileName,
        content: Buffer.from(signedFile.fileData),
      },
    }
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
      type: document.type,
    })),
    medicalExam: medicalExamAttachment,
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
    mapped.length
      ? prisma.employmentDocument.updateMany({
          where: { id: { in: mapped.map((document) => document.id) } },
          data: { sentAt, sentBy },
        })
      : Promise.resolve(),
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
    medicalExamAttachment
      ? prisma.employeeOnboarding.update({
          where: { id: onboardingId },
          data: {
            medicalExamRequestSentAt: sentAt,
            medicalExamRequestSentBy: sentBy,
          },
        })
      : Promise.resolve(),
  ])

  if (medicalExamAttachment) {
    const userId = (session.user as { id?: string }).id

    if (userId) {
      await prisma.onboardingChangeLog.create({
        data: {
          employeeId: onboardingId,
          userId,
          action: "MAIL_SENT",
          field: "medical_exam_request",
          oldValue: null,
          newValue: `Žádost o pracovnělékařskou prohlídku odeslána na ${email}.`,
        },
      })
    }

    await recomputeOnboardingReadiness(onboardingId)
  }

  return NextResponse.json({
    ok: true,
    sentTo: email,
    documentIds: mapped.map((document) => document.id),
  })
}
