import { NextResponse, type NextRequest } from "next/server"

import {
  buildResolvedProbationApiResponse,
  getOrEnsureProbationDetail,
  getProbationDetailByToken,
  jsonError,
  requirePublicProbationAccess,
  saveProbationEvaluation,
  sendCompletedProbationPdfToHr,
  type CurrentUser,
} from "@/lib/probation-evaluation-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

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
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const authResult = await requirePublicProbationAccess()
  if (!authResult.ok) return authResult.response

  const synced = await getSyncedRequestByToken({
    token: params.token,
    user: authResult.user,
  })

  if (!synced.ok) return synced.response

  return NextResponse.json(
    await buildResolvedProbationApiResponse({
      request: synced.request,
      currentUser: authResult.user,
    })
  )
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
      })

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
