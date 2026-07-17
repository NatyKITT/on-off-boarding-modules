import { NextResponse, type NextRequest } from "next/server"

import {
  buildEarlyExitNote,
  buildResolvedProbationApiResponse,
  getNumericId,
  getOrEnsureProbationDetail,
  jsonError,
  requireInternalProbationRead,
} from "@/lib/probation-evaluation-api"
import { renderProbationEvaluationPdfBuffer } from "@/lib/probation-evaluation-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)

  return arrayBuffer
}

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

    const payload = await buildResolvedProbationApiResponse({
      request,
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
    const filename = sanitizeFilename(
      payload.onboarding.fullName || String(onboardingId)
    )

    return new NextResponse(bufferToArrayBuffer(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Vyhodnoceni-zkusebni-doby-${filename}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[PROBATION PDF]", error)

    return NextResponse.json(
      {
        status: "error",
        message:
          "PDF formuláře k vyhodnocení zkušební doby se nepodařilo vygenerovat.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
