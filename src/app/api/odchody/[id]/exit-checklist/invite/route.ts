import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { sendSignatureInviteEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

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
  const inviteeEmail: string = body?.inviteeEmail?.trim() ?? ""
  const inviteeName: string = body?.inviteeName?.trim() ?? ""

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

  const offboarding = await prisma.employeeOffboarding.findUnique({
    where: { id: offboardingId },
    select: {
      id: true,
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    throw new Error("Proměnná prostředí NEXT_PUBLIC_APP_URL není nastavena.")
  }
  const signUrl = `${baseUrl}/odchody/${offboardingId}/vystupni-list`

  try {
    await sendSignatureInviteEmail({
      to: inviteeEmail,
      toName: inviteeName || undefined,
      employeeName,
      sentByName: session.user.name ?? session.user.email ?? "HR oddělení",
      signUrl,
    })
  } catch (err) {
    console.error("[exit-checklist/invite] E-mail se nepodařilo odeslat:", err)
    return NextResponse.json(
      {
        error:
          "E-mail se nepodařilo odeslat. Zkopírujte odkaz ručně a zašlete jej příjemci.",
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
