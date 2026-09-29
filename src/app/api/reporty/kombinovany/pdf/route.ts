import { NextResponse } from "next/server"
import { auth } from "@/auth"

import {
  renderCombinedReportHtml,
  type EmployeeChangeEmailRecord,
  type EmployeeChangeReportAudience,
} from "@/lib/email"
import { renderHtmlToPdfBuffer } from "@/lib/pdf-from-html"
import { canReadMonthlyReports } from "@/lib/rbac"
import { logReportAccess } from "@/lib/report-access-log"

import {
  buildCombinedReportFilename,
  toEmailRecord,
  type Audience,
  type IncomingChange,
  type IncomingOffboarding,
  type IncomingOnboarding,
} from "../shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function bufferToArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)

  return arrayBuffer
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canReadMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění generovat reporty." },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => null)) as {
    months: string[]
    audience: Audience
    onboardings: IncomingOnboarding[]
    offboardings: IncomingOffboarding[]
    changes: IncomingChange[]
  } | null

  if (!body || !Array.isArray(body.months) || body.months.length === 0) {
    return NextResponse.json({ error: "Neplatný požadavek." }, { status: 400 })
  }

  const { months, audience } = body
  const changeAudience: EmployeeChangeReportAudience = audience

  const onboardings = body.onboardings ?? []
  const offboardings = body.offboardings ?? []
  const changes = body.changes ?? []

  if (!onboardings.length && !offboardings.length && !changes.length) {
    return NextResponse.json(
      { error: "Vyberte alespoň jeden záznam." },
      { status: 400 }
    )
  }

  try {
    const onboardingsPlanned = onboardings.filter((o) => o.kind === "planned")
    const onboardingsActual = onboardings.filter((o) => o.kind === "actual")
    const offboardingsPlanned = offboardings.filter((o) => o.kind === "planned")
    const offboardingsActual = offboardings.filter((o) => o.kind === "actual")

    const changeEmailRecords: EmployeeChangeEmailRecord[] = changes.map(
      (c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        audience: null,
        effectiveDate: c.effectiveDate,
        titleBefore: c.newTitleBefore ?? c.oldTitleBefore,
        name: c.newName ?? c.oldName ?? "",
        surname: c.newSurname ?? c.oldSurname ?? "",
        titleAfter: c.newTitleAfter ?? c.oldTitleAfter,
        personalNumber: c.personalNumber,
        oldTitleBefore: c.oldTitleBefore,
        newTitleBefore: c.newTitleBefore,
        oldName: c.oldName,
        newName: c.newName,
        oldSurname: c.oldSurname,
        newSurname: c.newSurname,
        oldTitleAfter: c.oldTitleAfter,
        newTitleAfter: c.newTitleAfter,
        oldDepartment: c.oldDepartment,
        newDepartment: c.newDepartment,
        oldUnitName: c.oldUnitName,
        newUnitName: c.newUnitName,
        oldPositionName: c.oldPositionName,
        newPositionName: c.newPositionName,
        oldPositionNum: c.oldPositionNum,
        newPositionNum: c.newPositionNum,
      })
    )

    const { html } = await renderCombinedReportHtml({
      months,
      onboardingsPlanned: onboardingsPlanned.map((o) =>
        toEmailRecord(o, "onboarding")
      ),
      onboardingsActual: onboardingsActual.map((o) =>
        toEmailRecord(o, "onboarding")
      ),
      offboardingsPlanned: offboardingsPlanned.map((o) =>
        toEmailRecord(o, "offboarding")
      ),
      offboardingsActual: offboardingsActual.map((o) =>
        toEmailRecord(o, "offboarding")
      ),
      changes: changeEmailRecords,
      changeAudience,
    })

    const buffer = await renderHtmlToPdfBuffer(html)
    const filename = buildCombinedReportFilename(months)

    await logReportAccess({
      reportType: "MONTHLY_SUMMARY",
      by: (session.user as { id?: string }).id ?? null,
      byName: session.user.name ?? session.user.email ?? null,
      byEmail: session.user.email ?? null,
      message: `Kombinovaný měsíční report byl stažen jako PDF (${months.join(", ")}).`,
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
    console.error("POST /api/reporty/kombinovany/pdf error:", error)

    return NextResponse.json(
      { error: "Generování PDF selhalo." },
      { status: 500 }
    )
  }
}
