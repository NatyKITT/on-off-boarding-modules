import { NextResponse, type NextRequest } from "next/server"
import {
  ProbationEvaluationStatus,
  type ProbationEvaluationRequestStatus,
} from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  buildResolvedProbationApiResponse,
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

export async function PATCH(
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

    if (existing.isLocked) {
      return jsonError("Formulář je uzamčený. Nejdříve ho odemkněte.", 423)
    }

    if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
      return jsonError("Formulář již není dostupný k resetu.", 409)
    }

    const now = new Date()

    const userKey = getUserKey({
      id: authResult.user.id,
      email: authResult.user.email,
    })

    const userLabel = getUserLabel({
      name: authResult.user.name,
      email: authResult.user.email,
    })

    const nextStatus: ProbationEvaluationRequestStatus = existing.sentAt
      ? "SENT"
      : existing.supervisorEmail
        ? "READY"
        : "DRAFT"

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,

          completedAt: null,
          completedBy: null,
          completedByName: null,
          completedByEmail: null,

          completedNotificationSentAt: null,
          completedNotificationSentBy: null,

          resetAt: now,
          resetBy: userKey,
          resetByName: userLabel,

          data: {},
        },
      })

      await tx.probationEvaluation.updateMany({
        where: {
          requestId: existing.id,
          status: ProbationEvaluationStatus.ACTIVE,
        },
        data: {
          status: ProbationEvaluationStatus.VOIDED,
          lastEditedAt: now,
          lastEditedBy: userKey,
          lastEditedByName: userLabel,
          lastEditedByEmail: authResult.user.email ?? null,
        },
      })

      await addProbationEvent(tx, {
        requestId: existing.id,
        action: "RESET",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message:
          "HR vymazalo vyplněná data formuláře k vyhodnocení zkušební doby.",
        meta: {
          source: "manual",
          previousStatus: existing.status,
          nextStatus,
        },
      })
    })

    const updated = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!updated) {
      return jsonError("Data byla vymazána, ale nepodařilo se je načíst.", 500)
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request: updated,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION RESET]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Reset formuláře se nezdařil.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
