import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { getPersonalNumberMeta } from "@/lib/personal-number"
import { canReadInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canReadInternalApp(session.user.role)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Nemáte oprávnění zobrazit metainformace k osobním číslům.",
      },
      { status: 403 }
    )
  }

  try {
    const meta = await getPersonalNumberMeta()

    return NextResponse.json({
      status: "success",
      data: meta,
    })
  } catch (error) {
    console.error("Chyba při načítání PersonalNumberMeta:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst metainformace k osobním číslům.",
      },
      { status: 500 }
    )
  }
}
