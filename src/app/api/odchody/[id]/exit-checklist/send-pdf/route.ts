import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { sendExitChecklistPdfEmail } from "@/lib/email"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { canAdminExitChecklist } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getAppBaseUrl(req: NextRequest) {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    req.nextUrl.origin
  ).replace(/\/$/, "")
}

function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Nejste přihlášen." }, { status: 401 })
  }

  if (!canAdminExitChecklist(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění odesílat PDF výstupního listu." },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (!Number.isFinite(offboardingId)) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as {
    to?: unknown
    message?: unknown
  } | null

  const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : ""

  const message =
    typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : null

  if (!to || !isValidEmail(to)) {
    return NextResponse.json(
      { error: "Zadejte platný e-mail příjemce." },
      { status: 400 }
    )
  }

  const offboarding = await prisma.employeeOffboarding.findFirst({
    where: {
      id: offboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
      positionName: true,
      department: true,
      unitName: true,
      actualEnd: true,
      plannedEnd: true,
      exitChecklist: { select: { id: true } },
    },
  })

  if (!offboarding) {
    return NextResponse.json(
      { error: "Záznam odchodu nebyl nalezen." },
      { status: 404 }
    )
  }

  const cookie = req.headers.get("cookie") ?? ""
  const baseUrl = getAppBaseUrl(req)

  const pdfRes = await fetch(
    `${baseUrl}/api/odchody/${offboardingId}/vystupni-list`,
    {
      cache: "no-store",
      headers: { cookie, "x-internal-fetch": "1" },
    }
  )

  if (!pdfRes.ok) {
    return NextResponse.json(
      { error: "PDF se nepodařilo vygenerovat." },
      { status: 500 }
    )
  }

  const pdfArrayBuffer = await pdfRes.arrayBuffer()
  const pdfBuffer = Buffer.from(pdfArrayBuffer)

  const employeeName = [
    offboarding.titleBefore,
    offboarding.name,
    offboarding.surname,
    offboarding.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  const endDate = offboarding.actualEnd ?? offboarding.plannedEnd

  const employmentEndDate = endDate
    ? new Date(endDate).toLocaleDateString("cs-CZ")
    : "—"

  await sendExitChecklistPdfEmail({
    to,
    employeeName,
    employeePosition: offboarding.positionName ?? "",
    employeeDepartment: [offboarding.department, offboarding.unitName]
      .filter(Boolean)
      .join(" – "),
    employmentEndDate,
    message,
    pdfBuffer,
    filename: `Vystupni-list-${sanitizeFilename(employeeName || String(offboardingId))}.pdf`,
  })

  if (offboarding.exitChecklist) {
    await logExitChecklistEvent({
      checklistId: offboarding.exitChecklist.id,
      action: "PDF_DOWNLOADED",
      by: (session.user as { id?: string }).id ?? null,
      byName: session.user.name ?? session.user.email ?? null,
      byEmail: session.user.email ?? null,
      message: `PDF výstupního listu bylo odesláno na adresu ${to}.`,
    })
  }

  return NextResponse.json({
    status: "ok",
    message: `PDF bylo odesláno na adresu ${to}.`,
  })
}
