import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

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

const schema = z.object({
  locked: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireInternalProbationManage()
  if (!authResult.ok) return authResult.response

  const onboardingId = getNumericId(params.id)
  if (!onboardingId) return jsonError("Neplatné ID nástupu.", 400)

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "error",
        message: "Požadavek obsahuje neplatný stav zámku.",
        issues: parsed.error.flatten(),
      },
      { status: 422 }
    )
  }

  try {
    const existing = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!existing || existing.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
      return jsonError("Formulář již není dostupný.", 409)
    }

    const userKey = getUserKey({
      id: authResult.user.id,
      email: authResult.user.email,
    })

    const userLabel = getUserLabel({
      name: authResult.user.name,
      email: authResult.user.email,
    })

    await prisma.$transaction(async (tx) => {
      await tx.probationEvaluationRequest.update({
        where: { id: existing.id },
        data: {
          isLocked: parsed.data.locked,
        },
      })

      await addProbationEvent(tx, {
        requestId: existing.id,
        action: parsed.data.locked ? "LOCKED" : "UNLOCKED",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message: parsed.data.locked
          ? "Personální oddělení uzamklo hodnocení zkušební doby."
          : "Personální oddělení odemklo hodnocení zkušební doby k úpravám.",
        meta: {
          source: "manual",
          locked: parsed.data.locked,
        },
      })
    })

    const updated = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!updated) {
      return jsonError("Zámek byl změněn, ale data se nepodařilo načíst.", 500)
    }

    return NextResponse.json(
      await buildResolvedProbationApiResponse({
        request: updated,
        currentUser: authResult.user,
      })
    )
  } catch (error) {
    console.error("[PROBATION LOCK]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se změnit stav zámku.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
