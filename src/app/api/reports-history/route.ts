import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import type { MailJobType } from "@prisma/client"

import { prisma } from "@/lib/db"
import { canEditInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const SCOPE_TO_EMAIL_TYPES: Record<string, MailJobType[]> = {
  generic: ["GENERIC_EMAIL"],
  monthly: ["MONTHLY_SUMMARY"],
  changes: ["EMPLOYEE_CHANGE_SUMMARY"],
  statistics: ["STATISTICS_REPORT"],
  combined: ["MONTHLY_SUMMARY", "EMPLOYEE_CHANGE_SUMMARY"],
}

const ALL_REPORT_EMAIL_TYPES: MailJobType[] = [
  "GENERIC_EMAIL",
  "STATISTICS_REPORT",
  "MONTHLY_SUMMARY",
  "EMPLOYEE_CHANGE_SUMMARY",
]

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canEditInternalApp(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit historii reportů.",
      },
      { status: 403 }
    )
  }

  const scope = req.nextUrl.searchParams.get("scope")
  const emailTypes = scope
    ? (SCOPE_TO_EMAIL_TYPES[scope] ?? ALL_REPORT_EMAIL_TYPES)
    : ALL_REPORT_EMAIL_TYPES

  const [sentRows, downloadRows] = await Promise.all([
    prisma.emailHistory.findMany({
      where: {
        emailType: { in: emailTypes },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.reportAccessLog.findMany({
      where: { reportType: { in: emailTypes } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])

  const userKeys = Array.from(
    new Set(
      [
        ...sentRows.map((row) => row.createdBy),
        ...downloadRows.flatMap((row) => [row.by, row.byEmail]),
      ].filter((value): value is string => Boolean(value))
    )
  )

  const users =
    userKeys.length > 0
      ? await prisma.user.findMany({
          where: {
            OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }],
          },
          select: { id: true, email: true, name: true, surname: true },
        })
      : []

  const nameByKey = new Map<string, string>()

  for (const user of users) {
    const label =
      [user.name, user.surname].filter(Boolean).join(" ") ||
      user.email ||
      user.id

    if (user.id) nameByKey.set(user.id, label)
    if (user.email) nameByKey.set(user.email, label)
  }

  const sent = sentRows.map((row) => {
    const recipients = Array.isArray(row.recipients)
      ? row.recipients.filter(
          (value): value is string => typeof value === "string"
        )
      : []

    return {
      id: `email-${row.id}`,
      action: row.status === "FAILED" ? "FAILED" : "SENT",
      by: nameByKey.get(row.createdBy) ?? row.createdBy,
      message:
        recipients.length > 0
          ? `${row.subject} — komu: ${recipients.join(", ")}`
          : row.subject,
      createdAt: row.createdAt.toISOString(),
    }
  })

  const downloaded = downloadRows.map((row) => ({
    id: `download-${row.id}`,
    action: "DOWNLOADED",
    by:
      row.byName ||
      (row.byEmail && nameByKey.get(row.byEmail)) ||
      (row.by && nameByKey.get(row.by)) ||
      row.byEmail ||
      row.by ||
      null,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  }))

  const data = [...sent, ...downloaded]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)

  return NextResponse.json({ status: "success", data })
}
