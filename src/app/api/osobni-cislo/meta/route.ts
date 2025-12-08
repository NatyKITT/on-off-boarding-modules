import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { getPersonalNumberMeta } from "@/lib/personal-number"

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

  try {
    const meta = await getPersonalNumberMeta()

    return NextResponse.json({
      status: "success",
      data: meta,
    })
  } catch (err) {
    console.error("Chyba při načítání PersonalNumberMeta:", err)
    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst metainformace k osobním číslům.",
      },
      { status: 500 }
    )
  }
}
