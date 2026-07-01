import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/lib/db"
import { sendProbationEvaluationPdfEmail } from "@/lib/email"
import {
  buildResolvedProbationApiResponse,
  cleanText,
  getNumericId,
  getOrEnsureProbationDetail,
  isValidEmail,
  jsonError,
  requireInternalProbationManage,
} from "@/lib/probation-evaluation-api"
import { renderProbationEvaluationPdfBuffer } from "@/lib/probation-evaluation-pdf"
import {
  addProbationEvent,
  buildFullName,
  getHrRecipientsFromEnv,
  getUserKey,
  getUserLabel,
} from "@/lib/probation-evaluation-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function recommendationLabel(value?: boolean | null) {
  if (value === true) return "Doporučeno pokračování"
  if (value === false) return "Nedoporučeno pokračování"
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationManage()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  const body = (await req.json().catch(() => null)) as {
    to?: unknown
    message?: unknown
  } | null

  const to = cleanText(body?.to).toLowerCase()
  const message = cleanText(body?.message) || null

  if (!to || !isValidEmail(to)) {
    return jsonError("Zadejte platný e-mail příjemce.", 400)
  }

  const request = await getOrEnsureProbationDetail({
    onboardingId,
    user: authResult.user,
  })

  if (!request || request.onboarding.deletedAt) {
    return jsonError("Formulář k vyhodnocení zkušební doby nebyl nalezen.", 404)
  }

  if (request.status !== "COMPLETED" || !request.completedAt) {
    return jsonError("PDF lze odeslat až po finálním vyplnění formuláře.", 409)
  }

  const employeeName = buildFullName(request.onboarding)
  const latestEvaluation = request.evaluations?.[0] ?? null
  const hrRecipients = getHrRecipientsFromEnv().map((email) =>
    email.trim().toLowerCase()
  )
  const isHrRecipient = hrRecipients.includes(to)

  try {
    const payload = await buildResolvedProbationApiResponse({
      request,
      currentUser: authResult.user,
    })

    const pdfBuffer = await renderProbationEvaluationPdfBuffer(payload)

    await sendProbationEvaluationPdfEmail({
      to,
      employeeName,
      employeePosition: request.onboarding.positionName ?? null,
      employeeDepartment: request.onboarding.department ?? null,
      probationEndDate:
        request.probationEnd ?? request.onboarding.probationEnd ?? null,
      recommendation: recommendationLabel(latestEvaluation?.recommendation),
      evaluatorName: payload.request.evaluatorName ?? null,
      evaluatorEmail: payload.request.evaluatorEmail ?? null,
      message,
      sentByName: authResult.user.name ?? authResult.user.email ?? null,
      pdfBuffer,
      filename: `Vyhodnoceni-zkusebni-doby-${sanitizeFilename(
        employeeName || String(onboardingId)
      )}.pdf`,
    })

    await prisma.$transaction(async (tx) => {
      if (isHrRecipient) {
        await tx.probationEvaluationRequest.update({
          where: { id: request.id },
          data: {
            completedNotificationSentAt:
              request.completedNotificationSentAt ?? new Date(),
            completedNotificationSentBy: getUserKey({
              id: authResult.user.id,
              email: authResult.user.email,
            }),
          },
        })
      }

      await addProbationEvent(tx, {
        requestId: request.id,
        action: "HR_INFO_SENT",
        by: getUserKey({
          id: authResult.user.id,
          email: authResult.user.email,
        }),
        byName: getUserLabel({
          name: authResult.user.name,
          email: authResult.user.email,
        }),
        byEmail: authResult.user.email ?? null,
        message: `PDF formuláře k vyhodnocení zkušební doby bylo ručně odesláno na ${to}.`,
        meta: {
          recipient: to,
          isHrRecipient,
          manual: true,
        },
      })
    })

    return NextResponse.json({
      status: "success",
      message: `PDF bylo odesláno na adresu ${to}.`,
    })
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "PDF se nepodařilo odeslat."

    await prisma.$transaction(async (tx) => {
      await addProbationEvent(tx, {
        requestId: request.id,
        action: "EMAIL_FAILED",
        by: getUserKey({
          id: authResult.user.id,
          email: authResult.user.email,
        }),
        byName: getUserLabel({
          name: authResult.user.name,
          email: authResult.user.email,
        }),
        byEmail: authResult.user.email ?? null,
        message: `Ruční odeslání PDF formuláře k vyhodnocení zkušební doby na ${to} se nezdařilo.`,
        meta: {
          recipient: to,
          error: errorMessage,
          manual: true,
        },
      })
    })

    return jsonError(errorMessage, 500)
  }
}
