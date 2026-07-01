import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { sendProbationEvaluationInviteEmail } from "@/lib/email"
import {
  buildResolvedProbationApiResponse,
  cleanEmail,
  getJsonRecord,
  getNumericId,
  getOrEnsureProbationDetail,
  getProbationDetailByOnboardingId,
  getProbationRevisionRecord,
  jsonError,
  requireInternalProbationManage,
} from "@/lib/probation-evaluation-api"
import {
  addProbationEvent,
  buildFullName,
  getAppBaseUrlFromRequest,
  getSupervisorFullName,
  getUserKey,
  getUserLabel,
} from "@/lib/probation-evaluation-request"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const schema = z.object({
  supervisorEmail: z.string().trim().email(),
})

function isRevisionOpen(data: unknown) {
  const existingData = getJsonRecord(data)
  const revision = getProbationRevisionRecord(existingData.revision)

  return revision.open === true
}

export async function POST(
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
        message: "Zadejte platný e-mail vedoucího.",
        issues: parsed.error.flatten(),
      },
      { status: 422 }
    )
  }

  const supervisorEmail = cleanEmail(parsed.data.supervisorEmail)

  try {
    const existing = await getOrEnsureProbationDetail({
      onboardingId,
      user: authResult.user,
    })

    if (!existing || existing.onboarding.deletedAt) {
      return jsonError("Nástup nebyl nalezen.", 404)
    }

    if (existing.isLocked) {
      return jsonError("Formulář je uzamčený.", 423)
    }

    if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
      return jsonError("Formulář už není dostupný.", 409)
    }

    const completed = Boolean(
      existing.completedAt || existing.status === "COMPLETED"
    )
    const revisionOpen = isRevisionOpen(existing.data)

    if (completed && !revisionOpen) {
      return jsonError(
        "Hodnocení už je vyplněné. Znovu odeslat vedoucímu ho lze jen po otevření formuláře k úpravě.",
        409
      )
    }

    const baseUrl = getAppBaseUrlFromRequest(req)
    const employeeName = buildFullName(existing.onboarding)
    const supervisorName =
      existing.supervisorName || getSupervisorFullName(existing.onboarding)
    const evaluationLink = `${baseUrl}/vyhodnoceni-zkusebni-doby/${existing.token}`

    await sendProbationEvaluationInviteEmail({
      to: supervisorEmail,
      employeeName,
      employeePosition: existing.onboarding.positionName,
      employeeDepartment: existing.onboarding.department,
      employeeUnitName: existing.onboarding.unitName,
      probationEndDate:
        existing.probationEnd ?? existing.onboarding.probationEnd ?? null,
      supervisorName,
      supervisorEmail,
      evaluationLink,
      formType: existing.formType,
      sentByName: authResult.user.name ?? authResult.user.email ?? null,
    })

    const now = new Date()
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
          status: completed ? "COMPLETED" : "SENT",
          sentAt: now,
          sentBy: userKey,
          sentByName: userLabel,
          sentMethod: "MANUAL",
          supervisorName,
          supervisorEmail,
        },
      })

      await addProbationEvent(tx, {
        requestId: existing.id,
        action: "INVITE_SENT",
        by: userKey,
        byName: userLabel,
        byEmail: authResult.user.email ?? null,
        message: revisionOpen
          ? `Odkaz k úpravě vyhodnocení zkušební doby byl ručně odeslán na ${supervisorEmail}.`
          : `Pozvánka k hodnocení zkušební doby byla ručně odeslána na ${supervisorEmail}.`,
        meta: {
          source: "manual",
          directSend: true,
          mode: revisionOpen ? "revision" : "initial",
          supervisorName,
          supervisorEmail,
          evaluationLink,
        },
      })
    })

    const updated = await getProbationDetailByOnboardingId(onboardingId)

    if (!updated) {
      return jsonError(
        "Pozvánka byla odeslána, ale nepodařilo se znovu načíst stav formuláře.",
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
    console.error("[PROBATION INVITE]", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Pozvánku se nepodařilo odeslat.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
