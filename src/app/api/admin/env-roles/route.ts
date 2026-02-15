import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

export async function GET() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const superAdmins = parseEmails(process.env.SUPER_ADMIN_EMAILS)
  const hrEmails = parseEmails(process.env.HR_EMAILS)
  const itEmails = parseEmails(process.env.IT_EMAILS)
  const readonlyEmails = parseEmails(process.env.READONLY_EMAILS)

  const roleMap = new Map<string, "ADMIN" | "HR" | "IT" | "READONLY">()

  readonlyEmails.forEach((e) => {
    if (!roleMap.has(e)) roleMap.set(e, "READONLY")
  })
  itEmails.forEach((e) => {
    if (!roleMap.has(e)) roleMap.set(e, "IT")
  })
  hrEmails.forEach((e) => {
    if (!roleMap.has(e)) roleMap.set(e, "HR")
  })
  superAdmins.forEach((e) => {
    roleMap.set(e, "ADMIN")
  })

  const entries = Array.from(roleMap.entries()).map(([email, role]) => ({
    email,
    role,
  }))

  return NextResponse.json({ envUsers: entries })
}
