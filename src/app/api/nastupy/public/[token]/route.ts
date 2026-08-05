import { NextResponse, type NextRequest } from "next/server"

import { sendProbationEvaluationPdfEmail } from "@/lib/email"
import {
  buildEarlyExitNote,
  buildResolvedProbationApiResponse,
  getAppBaseUrl,
  getJsonRecord,
  getOrEnsureProbationDetail,
  getProbationDetailByToken,
  getTajemnikReview,
  jsonError,
  requirePublicProbationAccess,
  saveProbationEvaluation,
  sendCompletedProbationPdfToHr,
  sendTajemnikReviewRequestEmail,
  type CurrentUser,
} from "@/lib/probation-evaluation-api"
import { renderProbationEvaluationPdfBuffer } from "@/lib/probation-evaluation-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)

  return arrayBuffer
}

async function getSyncedRequestByToken(args: {
  token: string
  user: CurrentUser
}) {
  const token = args.token.trim()

  if (!token) {
    return {
      ok: false as const,
      response: jsonError(
        "Formulář k vyhodnocení zkušební doby nebyl nalezen.",
        404
      ),
    }
  }

  const tokenRequest = await getProbationDetailByToken(token)

  if (!tokenRequest || tokenRequest.onboarding.deletedAt) {
    return {
      ok: false as const,
      response: jsonError(
        "Formulář k vyhodnocení zkušební doby nebyl nalezen.",
        404
      ),
    }
  }

  const request = await getOrEnsureProbationDetail({
    onboardingId: tokenRequest.onboardingId,
    user: args.user,
  })

  if (!request || request.onboarding.deletedAt || request.token !== token) {
    return {
      ok: false as const,
      response: jsonError(
        "Formulář k vyhodnocení zkušební doby nebyl nalezen.",
        404
      ),
    }
  }

  return {
    ok: true as const,
    request,
  }
}

async function getSavedRequestOrError(args: {
  token: string
  user: CurrentUser
}) {
  const synced = await getSyncedRequestByToken(args)

  if (!synced.ok) {
    return {
      ok: false as const,
      response: jsonError(
        "Vyhodnocení se uložilo, ale nepodařilo se ho znovu načíst.",
        500
      ),
    }
  }

  return synced
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const authResult = await requirePublicProbationAccess()
  if (!authResult.ok) return authResult.response

  const synced = await getSyncedRequestByToken({
    token: params.token,
    user: authResult.user,
  })

  if (!synced.ok) return synced.response

  if (req.nextUrl.searchParams.get("format") === "pdf") {
    if (synced.request.status !== "COMPLETED") {
      return jsonError("Formulář zatím není finálně vyplněný.", 409)
    }

    try {
      const payload = await buildResolvedProbationApiResponse({
        request: synced.request,
        currentUser: authResult.user,
      })

      const earlyExitNote = await buildEarlyExitNote({
        personalNumber: payload.onboarding.personalNumber,
        probationEnd: payload.onboarding.probationEnd,
      })

      const pdfBuffer = await renderProbationEvaluationPdfBuffer({
        ...payload,
        onboarding: {
          ...payload.onboarding,
          earlyExitNote,
        },
      })

      return new NextResponse(bufferToArrayBuffer(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            'inline; filename="Vyhodnoceni-zkusebni-doby.pdf"',
          "Cache-Control": "no-store",
        },
      })
    } catch (error) {
      console.error("[PROBATION PUBLIC PDF]", error)
      return jsonError("PDF se nepodařilo vygenerovat.", 500)
    }
  }

  return NextResponse.json(
    await buildResolvedProbationApiResponse({
      request: synced.request,
      currentUser: authResult.user,
    })
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const authResult = await requirePublicProbationAccess()
  if (!authResult.ok) return authResult.response

  if (!authResult.user.email) {
    return jsonError("Chybí e-mail přihlášeného uživatele.", 400)
  }

  const synced = await getSyncedRequestByToken({
    token: params.token,
    user: authResult.user,
  })

  if (!synced.ok) return synced.response

  if (synced.request.status !== "COMPLETED") {
    return jsonError("Formulář zatím není finálně vyplněný.", 409)
  }

  try {
    const payload = await buildResolvedProbationApiResponse({
      request: synced.request,
      currentUser: authResult.user,
    })

    const earlyExitNote = await buildEarlyExitNote({
      personalNumber: payload.onboarding.personalNumber,
      probationEnd: payload.onboarding.probationEnd,
    })

    const pdfBuffer = await renderProbationEvaluationPdfBuffer({
      ...payload,
      onboarding: {
        ...payload.onboarding,
        earlyExitNote,
      },
    })

    const personalNumber =
      synced.request.onboarding.personalNumber ??
      String(synced.request.onboardingId)

    await sendProbationEvaluationPdfEmail({
      to: authResult.user.email,
      employeeName: payload.onboarding.fullName,
      employeePersonalNumber: payload.onboarding.personalNumber,
      employeePosition: payload.onboarding.positionName,
      employeeDepartment: payload.onboarding.department,
      probationEndDate: payload.onboarding.probationEnd,
      sentByName: authResult.user.name ?? authResult.user.email,
      pdfBuffer,
      filename: `Vyhodnoceni-zkusebni-doby-${personalNumber}.pdf`,
    })

    return NextResponse.json({ status: "success" as const })
  } catch (error) {
    console.error("[PROBATION PUBLIC PDF SEND]", error)
    return jsonError("PDF se nepodařilo odeslat.", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const authResult = await requirePublicProbationAccess()
  if (!authResult.ok) return authResult.response

  const synced = await getSyncedRequestByToken({
    token: params.token,
    user: authResult.user,
  })

  if (!synced.ok) return synced.response

  const body = await req.json().catch(() => null)

  try {
    const saved = await saveProbationEvaluation({
      request: synced.request,
      body,
      user: authResult.user,
      source: "public",
    })

    if (!saved.ok) return saved.response

    let updatedResult = await getSavedRequestOrError({
      token: params.token,
      user: authResult.user,
    })

    if (!updatedResult.ok) return updatedResult.response

    let updated = updatedResult.request

    if (saved.submitMode === "draft") {
      return NextResponse.json(
        await buildResolvedProbationApiResponse({
          request: updated,
          currentUser: authResult.user,
        })
      )
    }

    if (saved.submitMode === "final" && !updated.completedNotificationSentAt) {
      await sendCompletedProbationPdfToHr({
        request: updated,
        user: authResult.user,
        mode: "completed",
        tajemnikInfo: {
          required: saved.tajemnikRequired,
          name: saved.tajemnikName,
        },
      })

      if (saved.tajemnikRequired && saved.tajemnikEmail) {
        await sendTajemnikReviewRequestEmail({
          request: updated,
          user: authResult.user,
          tajemnikEmail: saved.tajemnikEmail,
          baseUrl: getAppBaseUrl(req),
        })
      }

      updatedResult = await getSavedRequestOrError({
        token: params.token,
        user: authResult.user,
      })

      if (!updatedResult.ok) return updatedResult.response
      updated = updatedResult.request
    }

    if (saved.submitMode === "revision") {
      await sendCompletedProbationPdfToHr({
        request: updated,
        user: authResult.user,
        mode: "revision",
      })

      updatedResult = await getSavedRequestOrError({
        token: params.token,
        user: authResult.user,
      })

      if (!updatedResult.ok) return updatedResult.response
      updated = updatedResult.request
    }

    if (saved.submitMode === "tajemnik") {
      const tajemnikReview = getTajemnikReview(
        getJsonRecord(updated.data).tajemnikReview
      )

      await sendCompletedProbationPdfToHr({
        request: updated,
        user: authResult.user,
        mode: "tajemnik",
        tajemnikInfo: {
          required: true,
          name: tajemnikReview.signedByName ?? null,
          agreement: tajemnikReview.agreement ?? null,
        },
      })

      updatedResult = await getSavedRequestOrError({
        token: params.token,
        user: authResult.user,
      })

      if (!updatedResult.ok) return updatedResult.response
      updated = updatedResult.request
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request: updated,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION PUBLIC PUT]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při ukládání vyhodnocení zkušební doby.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
