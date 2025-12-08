import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { EmploymentDocumentType } from "@prisma/client"

import { logEmailHistory, sendMail } from "@/lib/email"

type Body = {
  email: string
  employeeName?: string
  onboardingId: number
  documents: {
    id: number
    url: string
    type: EmploymentDocumentType
  }[]
}

function typeLabel(t: EmploymentDocumentType) {
  switch (t) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "EDUCATION":
      return "Přehled vzdělání"
    case "EXPERIENCE":
      return "Přehled praxe"
    default:
      return t
  }
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as Body
    const { email, employeeName, onboardingId, documents } = body

    if (!email) {
      return NextResponse.json(
        { message: "Chybí e-mailová adresa zaměstnance." },
        { status: 400 }
      )
    }

    const docsWithUrl = (documents ?? []).filter((d) => !!d.url)
    if (!docsWithUrl.length) {
      return NextResponse.json(
        { message: "Nejsou vybrané žádné dokumenty k odeslání." },
        { status: 400 }
      )
    }

    const linksHtml = docsWithUrl
      .map(
        (d, i) =>
          `<li><a href="${d.url}" target="_blank" rel="noopener noreferrer">
            ${i + 1}. ${typeLabel(d.type)}
          </a></li>`
      )
      .join("")

    const subject = `Dokumenty k nástupu – ${
      employeeName ?? "nový zaměstnanec"
    }`

    const validityInfo = `
    <p>Odkazy na dokumenty jsou platné po omezenou dobu
     (obvykle 14&nbsp;dní od odeslání tohoto e-mailu).</p>
    `

    const html = `
      <p>Dobrý den${employeeName ? `, ${employeeName}` : ""},</p>
      <p>zasíláme Vám odkazy na dokumenty k nástupu do zaměstnání
         na Úřad městské části Praha&nbsp;6. Prosíme o jejich vyplnění
         co nejdříve:</p>
      <ul>${linksHtml}</ul>
      ${validityInfo}
      <p>Pokud byste narazil/a na problém při vyplňování,
         kontaktujte prosím personální oddělení.</p>
      <p>S pozdravem<br/>Městská část Praha&nbsp;6</p>
    `

    await sendMail({
      to: [email],
      subject,
      html,
    })

    await logEmailHistory({
      onboardingEmployeeId: onboardingId,
      emailType: "EMPLOYEE_INFO",
      recipients: [email],
      subject,
      content: html,
      status: "SENT",
      createdBy:
        (session.user as { id?: string }).id ?? session.user.email ?? "unknown",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("send-link error", error)

    const session = await auth()

    await logEmailHistory({
      onboardingEmployeeId: undefined,
      emailType: "EMPLOYEE_INFO",
      recipients: [],
      subject: "Dokumenty k nástupu – ERROR",
      content: "",
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      createdBy:
        (session?.user as { id?: string })?.id ??
        session?.user?.email ??
        "unknown",
    })

    return NextResponse.json(
      { message: "Chyba při odesílání e-mailu." },
      { status: 500 }
    )
  }
}
