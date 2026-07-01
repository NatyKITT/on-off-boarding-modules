import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { canReadInternalApp } from "@/lib/rbac"
import { getPositions } from "@/lib/systemizace"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  if (!canReadInternalApp(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění načítat pozice ze systemizace.",
      },
      { status: 403 }
    )
  }

  try {
    const data = await getPositions()

    return NextResponse.json({
      status: "success",
      data,
    })
  } catch (error) {
    console.error("Chyba při načítání pozic:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při získávání dat ze systemizace.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
