import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getSchema = z.object({
  onboardingId: z.coerce.number().int(),
})

const postSchema = z.object({
  onboardingId: z.number().int(),
  email: z.string().email(),
  employeeName: z.string().optional(),
  documents: z
    .array(
      z.object({
        id: z.number().int(),
        type: z.nativeEnum(EmploymentDocumentType),
        url: z.string().optional(),
      })
    )
    .min(1),
})

function baseUrlFrom(req: NextRequest) {
  return process.env.NEXTAUTH_URL ?? req.nextUrl.origin
}

function docTypeLabel(t: EmploymentDocumentType) {
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

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const parsed = getSchema.safeParse({
    onboardingId: req.nextUrl.searchParams.get("onboardingId"),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný parametr onboardingId." },
      { status: 400 }
    )
  }

  const baseUrl = baseUrlFrom(req)

  const documents = await prisma.employmentDocument.findMany({
    where: { onboardingId: parsed.data.onboardingId },
    select: {
      id: true,
      type: true,
      status: true,
      createdAt: true,
      completedAt: true,
      fileUrl: true,
      accessHash: true,
      isLocked: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const docsWithUrl = documents.map((d) => ({
    ...d,
    publicUrl: d.accessHash ? `${baseUrl}/dokumenty/${d.accessHash}` : null,
  }))

  return NextResponse.json({ documents: docsWithUrl })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = postSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Neplatný požadavek." },
      { status: 400 }
    )
  }

  const { onboardingId, email, employeeName, documents } = parsed.data
  const baseUrl = baseUrlFrom(req)

  const ids = documents.map((d) => d.id)

  const docsFromDb = await prisma.employmentDocument.findMany({
    where: { id: { in: ids }, onboardingId },
    select: {
      id: true,
      type: true,
      accessHash: true,
      status: true,
      expiresAt: true,
      isLocked: true,
    },
  })

  const mapped = docsFromDb
    .filter((d) => d.accessHash)
    .map((d) => ({
      id: d.id,
      type: d.type,
      url: `${baseUrl}/dokumenty/${d.accessHash}`,
    }))

  if (!mapped.length) {
    return NextResponse.json(
      { message: "Vybrané dokumenty nemají veřejný odkaz (chybí hash)." },
      { status: 400 }
    )
  }

  const safeEmployeeName = (employeeName ?? "").trim()
  const subject = safeEmployeeName
    ? `Dokumenty k nástupu – ${safeEmployeeName}`
    : "Dokumenty k nástupu"

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 10px 0;">Dokumenty k nástupu</h2>
      <p style="margin: 0 0 12px 0;">
        Dobrý den${safeEmployeeName ? `, <strong>${safeEmployeeName}</strong>` : ""},<br/>
        prosíme o vyplnění následujících dokumentů:
      </p>

      <ul style="padding-left: 18px; margin: 0 0 14px 0;">
        ${mapped
          .map(
            (d) => `
          <li style="margin: 6px 0;">
            <strong>${docTypeLabel(d.type)}</strong> –
            <a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.url}</a>
          </li>`
          )
          .join("")}
      </ul>

      <p style="margin: 0 0 12px 0; color: #374151;">
        Odkazy jsou určené pouze pro vás. Po odeslání formuláře už není potřeba vyplňovat znovu.
      </p>

      <p style="margin: 0; color: #6b7280; font-size: 12px;">
        Tento e-mail byl automaticky vygenerován systémem On-Boarding Modul ÚMČ Praha 6.
      </p>
    </div>
  `

  await sendMail({
    to: [email],
    subject,
    html,
  })

  return NextResponse.json({ ok: true })
}
