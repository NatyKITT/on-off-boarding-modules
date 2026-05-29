import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"
import { ChecklistResolution, Prisma } from "@prisma/client"

import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"
import { sendBehalfSignatureEmail, sendSignatureInviteEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
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
      { error: "Nemáte oprávnění odesílat pozvánky k podpisu." },
      { status: 403 }
    )
  }

  const offboardingId = Number(params.id)

  if (Number.isNaN(offboardingId)) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 })
  }

  const body = await req.json().catch(() => null)

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Chybí tělo požadavku." },
      { status: 400 }
    )
  }

  const inviteeEmail = cleanText(body.inviteeEmail)
  const isBehalf = body.isBehalf === true
  const behalfOf = cleanText(body.behalfOf)
  const behalfOfName = cleanText(body.behalfOfName)
  const behalfOfRole = cleanText(body.behalfOfRole)
  const behalfOfDisplayLabel = cleanText(body.behalfOfDisplayLabel)

  if (!inviteeEmail) {
    return NextResponse.json(
      { error: "E-mailová adresa příjemce je povinná." },
      { status: 400 }
    )
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(inviteeEmail)) {
    return NextResponse.json(
      { error: "Zadaná e-mailová adresa není platná." },
      { status: 400 }
    )
  }

  if (isBehalf && !behalfOf && !behalfOfName && !behalfOfDisplayLabel) {
    return NextResponse.json(
      { error: "Vyberte, za koho bude příjemce podepisovat." },
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
      personalNumber: true,
      positionName: true,
      department: true,
      unitName: true,
      actualEnd: true,
      plannedEnd: true,
      exitChecklist: true,
    },
  })

  if (!offboarding) {
    return NextResponse.json(
      { error: "Záznam odchodu nebyl nalezen." },
      { status: 404 }
    )
  }

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

  let checklist = offboarding.exitChecklist

  if (!checklist) {
    checklist = await prisma.exitChecklist.create({
      data: {
        offboardingId: offboarding.id,
        header: {
          employeeName,
          personalNumber: offboarding.personalNumber ?? null,
          department: offboarding.department,
          unitName: offboarding.unitName,
          employmentEndDate: endDate?.toISOString() ?? new Date().toISOString(),
        } as Prisma.InputJsonObject,
        items: {
          create: EXIT_CHECKLIST_ROWS.map((row, index) => ({
            key: row.key,
            department: row.organization,
            label: row.obligation,
            order: index,
            resolution: ChecklistResolution.NOT_APPLICABLE,
          })),
        },
      },
    })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!baseUrl) {
    return NextResponse.json(
      { error: "Není nastavena proměnná NEXT_PUBLIC_APP_URL." },
      { status: 500 }
    )
  }

  const signUrl = `${baseUrl}/odchody-public/${checklist.publicToken}`
  const sentByName = session.user.name ?? session.user.email ?? "HR oddělení"

  try {
    if (isBehalf) {
      await sendBehalfSignatureEmail({
        to: inviteeEmail,
        behalfOfName: behalfOfName || behalfOf || "zodpovědnou osobu",
        behalfOfRole,
        behalfOfDisplayLabel: behalfOfDisplayLabel || behalfOf || undefined,

        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        signUrl,
      })
    } else {
      await sendSignatureInviteEmail({
        to: inviteeEmail,
        employeeName,
        employeePosition: offboarding.positionName ?? "",
        employeeDepartment: offboarding.department ?? "",
        employmentEndDate,
        sentByName,
        signUrl,
      })
    }
  } catch (err) {
    console.error("[exit-checklist/invite] E-mail se nepodařilo odeslat:", err)

    return NextResponse.json(
      {
        error: "E-mail se nepodařilo odeslat. Zkopírujte odkaz ručně.",
        signUrl,
      },
      { status: 207 }
    )
  }

  return NextResponse.json({
    status: "ok",
    message: `Pozvánka k podpisu byla odeslána na adresu ${inviteeEmail}.`,
    signUrl,
  })
}
