import { NextResponse, type NextRequest } from "next/server"

import {
  buildResolvedProbationApiResponse,
  getNumericId,
  getOrEnsureProbationDetail,
  getProbationDetailByOnboardingId,
  jsonError,
  requireInternalProbationManage,
  requireInternalProbationRead,
  saveProbationEvaluation,
  sendCompletedProbationPdfToHr,
} from "@/lib/probation-evaluation-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationRead()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  try {
    const request = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!request || request.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION GET]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při načítání vyhodnocení zkušební doby.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationManage()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  const body = await req.json().catch(() => null)

  try {
    const existing = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!existing || existing.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    const saved = await saveProbationEvaluation({
      request: existing,
      body,
      user: authResult.user,
      source: "internal",
    })

    if (!saved.ok) return saved.response

    let updated = await getProbationDetailByOnboardingId(onboardingId)

    if (!updated) {
      return jsonError(
        "Vyhodnocení se uložilo, ale nepodařilo se ho znovu načíst.",
        500
      )
    }

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

      updated = await getProbationDetailByOnboardingId(onboardingId)

      if (!updated) {
        return jsonError(
          "Vyhodnocení se uložilo, ale nepodařilo se ho znovu načíst.",
          500
        )
      }
    }

    if (saved.submitMode === "revision") {
      await sendCompletedProbationPdfToHr({
        request: updated,
        user: authResult.user,
        mode: "revision",
      })

      updated = await getProbationDetailByOnboardingId(onboardingId)

      if (!updated) {
        return jsonError(
          "Vyhodnocení se uložilo, ale nepodařilo se ho znovu načíst.",
          500
        )
      }
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request: updated,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION PUT]", error)

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
