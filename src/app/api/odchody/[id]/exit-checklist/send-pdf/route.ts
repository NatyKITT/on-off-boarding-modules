import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { sendExitChecklistPdfEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Nejste přihlášen." }, { status: 401 })
  }

  const role = session.user.role ?? "USER"

  if (!["ADMIN", "HR", "IT"].includes(role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění odesílat PDF výstupního listu." },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (Number.isNaN(offboardingId)) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 })
  }

  const body = await req.json().catch(() => null)

  const to = body?.to?.trim()?.toLowerCase()
  const message = body?.message?.trim() || null

  if (!to || !isValidEmail(to)) {
    return NextResponse.json(
      { error: "Zadejte platný e-mail příjemce." },
      { status: 400 }
    )
  }

  const offboarding = await prisma.employeeOffboarding.findUnique({
    where: { id: offboardingId },
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
    },
  })

  if (!offboarding) {
    return NextResponse.json(
      { error: "Záznam odchodu nebyl nalezen." },
      { status: 404 }
    )
  }

  const baseUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL

  if (!baseUrl) {
    return NextResponse.json(
      { error: "Chybí AUTH_URL nebo NEXT_PUBLIC_APP_URL." },
      { status: 500 }
    )
  }

  const cookie = req.headers.get("cookie") ?? ""

  const pdfRes = await fetch(
    `${baseUrl}/api/odchody/${offboardingId}/vystupni-list`,
    {
      cache: "no-store",
      headers: { cookie },
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
    sentByName: session.user.name ?? session.user.email ?? null,
    pdfBuffer,
    filename: `Vystupni-list-${employeeName.replace(/\s+/g, "-")}.pdf`,
  })

  return NextResponse.json({
    status: "ok",
    message: `PDF bylo odesláno na adresu ${to}.`,
  })
}
