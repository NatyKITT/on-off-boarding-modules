import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { recipientsFor } from "@/lib/email-config"
import { canReadMonthlyReports } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canReadMonthlyReports(session.user.role)) {
    return NextResponse.json(
      { error: "Nemáte oprávnění zobrazit příjemce reportů." },
      { status: 403 }
    )
  }

  const [onboardingGroup, allEmployees] = await Promise.all([
    recipientsFor("planned"),
    recipientsFor("all"),
  ])

  return NextResponse.json({ onboardingGroup, allEmployees })
}
