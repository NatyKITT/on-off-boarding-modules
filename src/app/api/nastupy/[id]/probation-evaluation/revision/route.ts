import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

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

type RevisionRecord = {
  open?: boolean | null
  openedAt?: string | null
  openedByName?: string | null
  openedByEmail?: string | null
  editedAt?: string | null
  editedByName?: string | null
  editedByEmail?: string | null
  count?: number | null
}

function getRevisionRecord(value: unknown): RevisionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as RevisionRecord
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationManage()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  const body = (await req.json().catch(() => null)) as {
    open?: boolean
  } | null

  if (body?.open !== true) {
    return jsonError("Chybí požadavek na otevření formuláře k úpravě.", 400)
  }

  try {
    const request = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!request || request.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    if (request.isLocked) {
      return jsonError("Formulář je uzamčený. Nejdříve ho odemkněte.", 423)
    }

    if (request.status === "CANCELLED" || request.status === "EXPIRED") {
      return jsonError("Formulář již není dostupný k úpravám.", 409)
    }

    if (request.status !== "COMPLETED") {
      return jsonError(
        "K úpravě lze otevřít jen formulář, který už byl finálně vyplněn.",
        409
      )
    }

    const existingData = getJsonRecord(request.data)
    const previousRevision = getRevisionRecord(existingData.revision)

    const nowIso = new Date().toISOString()

    const userLabel = getUserLabel({
      name: authResult.user.name,
      email: authResult.user.email,
    })

    const userKey = getUserKey({
      id: authResult.user.id,
      email: authResult.user.email,
    })

    const nextCount =
      typeof previousRevision.count === "number"
        ? previousRevision.count + 1
        : 1

    const nextRevision: RevisionRecord = {
      ...previousRevision,
      open: true,
      openedAt: nowIso,
      openedByName: userLabel,
      openedByEmail: authResult.user.email ?? null,
      count: nextCount,
    }

    const nextData = {
      ...(existingData as Prisma.InputJsonObject),
      revision: nextRevision as Prisma.InputJsonObject,
    } satisfies Prisma.InputJsonObject

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: request.id },
        data: {
          completedNotificationSentAt: null,
          completedNotificationSentBy: null,
          data: nextData,
        },
      })

      await addProbationEvent(tx, {
        requestId: request.id,
        action: "UPDATED",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message:
          "Formulář vyhodnocení zkušební doby byl otevřen k úpravě.",
        meta: {
          source: "internal",
          revisionAction: "opened_for_edit",
          revision: nextRevision as Prisma.InputJsonObject,
        },
      })
    })

    const updated = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!updated) {
      return jsonError(
        "Formulář byl otevřen k úpravě, ale nepodařilo se ho znovu načíst.",
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
    console.error("[PROBATION REVISION PATCH]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Formulář se nepodařilo otevřít k úpravě.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
