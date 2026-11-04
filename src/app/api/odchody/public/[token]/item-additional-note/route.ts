import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { prisma } from "@/lib/db"
import {
  getChecklistByPublicToken,
  isPraha6OrKitt6,
  sanitizeText,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase()
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await getSession()
  const user = session?.user

  if (!user || !isPraha6OrKitt6(user.email)) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const body = (await req.json().catch(() => null)) as {
    key?: string
    note?: string
  } | null

  const key = EXIT_CHECKLIST_ROWS.find((row) => row.key === body?.key)?.key

  if (!key) {
    return NextResponse.json(
      { status: "error", message: "Neplatná položka agendy." },
      { status: 400 }
    )
  }

  const note = sanitizeText(body?.note)

  const checklist = await getChecklistByPublicToken(params.token)

  if (!checklist) {
    return NextResponse.json(
      { status: "error", message: "Výstupní list nebyl nalezen." },
      { status: 404 }
    )
  }

  const header = getRecord(checklist.header)

  const currentUserEmail = normalizeEmail(user.email)
  const activeRecipients = Array.isArray(header.signatureRecipients)
    ? (header.signatureRecipients as Array<Record<string, unknown>>)
    : []
  const isActiveSigner = activeRecipients.some(
    (recipient) =>
      !recipient.revokedAt &&
      normalizeEmail(recipient.email as string) === currentUserEmail
  )

  if (!isActiveSigner) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění tuto položku doplňovat.",
      },
      { status: 403 }
    )
  }

  const itemAdditionalNotes = getRecord(header.itemAdditionalNotes)

  const nextHeader: Prisma.InputJsonObject = {
    ...header,
    itemAdditionalNotes: {
      ...itemAdditionalNotes,
      [key]: note
        ? {
            note,
            resolvedAt: new Date().toISOString(),
            resolvedByName: user.name ?? user.email ?? null,
            resolvedByEmail: user.email ?? null,
          }
        : null,
    },
  } as Prisma.InputJsonObject

  await prisma.exitChecklist.update({
    where: { id: checklist.id },
    data: { header: nextHeader },
  })

  await logExitChecklistEvent({
    checklistId: checklist.id,
    action: "UPDATED",
    by: user.id,
    byName: user.name ?? user.email ?? null,
    byEmail: user.email ?? null,
    message: note
      ? `Doplněna informace k nesplněné agendě (${key}): ${note}`
      : `Zrušena doplňující informace k nesplněné agendě (${key}).`,
  })

  return NextResponse.json({ status: "ok" })
}
