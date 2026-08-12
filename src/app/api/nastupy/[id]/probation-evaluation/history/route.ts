import { NextResponse, type NextRequest } from "next/server"

import { prisma } from "@/lib/db"
import {
  getNumericId,
  getProbationDetailByOnboardingId,
  jsonError,
  requireInternalProbationRead,
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

  const request = await getProbationDetailByOnboardingId(onboardingId)

  if (!request || request.onboarding.deletedAt) {
    return NextResponse.json({ status: "success", data: [] })
  }

  const events = await prisma.probationEvaluationRequestEvent.findMany({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({
    status: "success",
    data: events.map((event) => ({
      id: event.id,
      action: event.action,
      by: event.byName || event.byEmail || event.by || null,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  })
}
