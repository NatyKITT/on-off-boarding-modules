import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  buildResolvedProbationApiResponse,
  cleanEmail,
  cleanText,
  getNumericId,
  getOrEnsureProbationDetail,
  jsonError,
  requireInternalProbationManage,
  setTajemnikOverride,
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
  name: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
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
    return jsonError("Neplatná data.", 422)
  }

  const email = cleanEmail(parsed.data.email)
  const name = cleanText(parsed.data.name)

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Zadejte platný e-mail tajemníka.", 422)
  }

  try {
    const existing = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!existing || existing.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    const userKey = getUserKey({
      id: authResult.user.id,
      email: authResult.user.email,
    })
    const userLabel = getUserLabel({
      name: authResult.user.name,
      email: authResult.user.email,
    })

    const isClearing = !email

    await prisma.$transaction(async (tx) => {
      await setTajemnikOverride({
        name,
        email,
        updatedBy: userLabel || userKey,
        client: tx,
      })

      await addProbationEvent(tx, {
        requestId: existing.id,
        action: "UPDATED",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message: isClearing
          ? "Ruční nastavení tajemníka bylo zrušeno (globálně, pro všechny nástupy) - opět se dohledává automaticky z EOS."
          : `Tajemník byl ručně nastaven (globálně, pro všechny nástupy) na ${name ? `${name} (${email})` : email}.`,
        meta: {
          source: "manual",
          scope: "global",
          revisionAction: isClearing
            ? "tajemnik_override_cleared"
            : "tajemnik_override_set",
          tajemnikOverrideName: email ? name || null : null,
          tajemnikOverrideEmail: email || null,
        },
      })
    })

    const updated = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!updated) {
      return jsonError(
        "Tajemník byl uložen, ale data se nepodařilo znovu načíst.",
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
    console.error("[PROBATION TAJEMNIK OVERRIDE]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nastavení tajemníka se nezdařilo.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
