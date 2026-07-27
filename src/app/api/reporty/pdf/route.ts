import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { canReadMonthlyReports } from "@/lib/rbac"
import { logReportAccess } from "@/lib/report-access-log"
import {
  buildReportSections,
  reportSelectionPayloadSchema,
} from "@/lib/reports/pdf-report-data"
import {
  buildReportFilename,
  buildReportMonthsLabel,
  buildReportTitle,
  renderPdfReportBuffer,
} from "@/lib/reports/pdf-report-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)

  return arrayBuffer
}

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { message: "Nemáte oprávnění generovat reporty." },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = reportSelectionPayloadSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const sections = await buildReportSections(parsed.data.sections)

  if (sections.length === 0) {
    return NextResponse.json(
      { message: "Pro vybrané záznamy se nepodařilo najít žádná data." },
      { status: 400 }
    )
  }

  try {
    const generatedAt = new Date()

    const buffer = await renderPdfReportBuffer(sections, {
      generatedByName:
        session.user.name ?? session.user.email ?? "Neznámý uživatel",
      generatedAt,
    })

    const filename = buildReportFilename(sections, generatedAt)
    const monthsLabel = buildReportMonthsLabel(sections)
    const title = buildReportTitle(sections)

    await logReportAccess({
      reportType: "GENERIC_EMAIL",
      by: (session.user as { id?: string }).id ?? null,
      byName: session.user.name ?? session.user.email ?? null,
      byEmail: session.user.email ?? null,
      message: monthsLabel
        ? `${title} byl stažen jako PDF (${monthsLabel}).`
        : `${title} byl stažen jako PDF.`,
    })

    return new NextResponse(bufferToArrayBuffer(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("POST /api/reporty/pdf error:", error)

    return NextResponse.json(
      { message: "Generování PDF selhalo." },
      { status: 500 }
    )
  }
}
