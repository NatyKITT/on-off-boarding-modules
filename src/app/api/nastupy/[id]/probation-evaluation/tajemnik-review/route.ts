import { NextResponse, type NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  buildResolvedProbationApiResponse,
  getJsonRecord,
  getNumericId,
  getOrEnsureProbationDetail,
  jsonError,
  requireInternalProbationManage,
} from "@/lib/probation-evaluation-api"
import {
  addProbationEvent,
  getUserKey,
  getUserLabel,
} from "@/lib/probation-evaluation-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationManage()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  try {
    const existing = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!existing || existing.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    if (existing.status !== "COMPLETED") {
      return jsonError(
        "Formulář zatím není finálně vyplněný, stanovisko tajemníka nelze zrušit.",
        409
      )
    }

    const existingData = getJsonRecord(existing.data)

    if (!existingData.tajemnikReview) {
      return jsonError(
        "Tajemník se k tomuto vyhodnocení zatím nevyjádřil.",
        409
      )
    }

    const userKey = getUserKey({
      id: authResult.user.id,
      email: authResult.user.email,
    })

    const userLabel = getUserLabel({
      name: authResult.user.name,
      email: authResult.user.email,
    })

    const restData = Object.fromEntries(
      Object.entries(existingData).filter(([key]) => key !== "tajemnikReview")
    )

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: existing.id },
        data: {
          data: restData as Prisma.InputJsonObject,
        },
      })

      await addProbationEvent(tx, {
        requestId: existing.id,
        action: "UPDATED",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message:
          "Personální oddělení ručně zrušilo stanovisko tajemníka u tohoto vyhodnocení.",
        meta: {
          source: "manual",
          revisionAction: "tajemnik_review_cleared",
        },
      })
    })

    const updated = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!updated) {
      return jsonError(
        "Stanovisko bylo zrušeno, ale data se nepodařilo znovu načíst.",
        500
      )
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request: updated,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION TAJEMNIK REVIEW CLEAR]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Zrušení stanoviska tajemníka se nezdařilo.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
