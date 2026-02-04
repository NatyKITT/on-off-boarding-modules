import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmploymentDocumentType } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/email"
import { buildEmployeeMeta } from "@/lib/employee-meta"
import { absoluteUrl } from "@/lib/url"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const postSchema = z.object({
  onboardingId: z.number().int(),
  email: z.string().email(),
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

function docTypeLabel(t: EmploymentDocumentType) {
  switch (t) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "PAYROLL_INFO":
      return "Dotazník pro vedení mzdové agendy"
    default:
      return t
  }
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

  const { onboardingId, email, documents } = parsed.data
  const ids = documents.map((d) => d.id)

  const onboarding = await prisma.employeeOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      id: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
      department: true,
      unitName: true,
      positionName: true,
      email: true,
      userEmail: true,
    },
  })

  if (!onboarding) {
    return NextResponse.json(
      { message: "Nástup nebyl nalezen." },
      { status: 404 }
    )
  }

  const meta = buildEmployeeMeta(onboarding)
  const employeeName =
    meta.fullName || `${onboarding.name} ${onboarding.surname}`.trim()

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
      url: absoluteUrl(`/dokumenty/${d.accessHash}`, req),
      label: docTypeLabel(d.type),
    }))

  if (!mapped.length) {
    return NextResponse.json(
      { message: "Vybrané dokumenty nemají veřejný odkaz (chybí hash)." },
      { status: 400 }
    )
  }

  const subject = employeeName
    ? `Dokumenty k nástupu – ${employeeName}`
    : "Dokumenty k nástupu"

  const departmentText = meta.department?.trim()
  const positionText = meta.position?.trim()

  const infoBlock =
    departmentText || positionText
      ? `
        <div style="margin: 12px 0 0 0; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
          <div style="font-size: 12px; color: #374151;">
            ${positionText ? `<div><strong>Pozice:</strong> ${positionText}</div>` : ""}
            ${departmentText ? `<div><strong>Odbor / oddělení:</strong> ${departmentText}</div>` : ""}
          </div>
        </div>
      `
      : ""

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin: 0 0 10px 0;">Dokumenty k nástupu</h2>

      <p style="margin: 0 0 12px 0;">
        Dobrý den${employeeName ? `, <strong>${employeeName}</strong>` : ""},<br/>
        prosíme o vyplnění následujících dokumentů pro uvedenou pozici:
      </p>

      ${infoBlock}

      <ul style="padding-left: 18px; margin: 14px 0 14px 0;">
        ${mapped
          .map(
            (d) => `
          <li style="margin: 6px 0;">
            <strong>${d.label}</strong> –
            <a href="${d.url}" target="_blank" rel="noopener noreferrer">${d.url}</a>
          </li>`
          )
          .join("")}
      </ul>

      <div style="margin: 14px 0 12px 0; padding: 12px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;">
        <div style="font-size: 12px; color: #9a3412;">
          <strong>Důležité:</strong>
          <ul style="margin: 8px 0 0 18px; padding: 0;">
            <li>Odkazy jsou určeny pouze pro vás – <strong>nepřeposílejte je</strong> dalším osobám.</li>
            <li>Formuláře vyplňte <strong>osobně</strong>, <strong>pravdivě</strong> a <strong>pečlivě</strong>.</li>
            <li>Po odeslání už zpravidla není potřeba dokumenty vyplňovat znovu.</li>
          </ul>
        </div>
      </div>

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
