import { NextResponse } from "next/server"

import { getPositions } from "@/lib/systemizace"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  try {
    const data = await getPositions()
    return NextResponse.json({ data })
  } catch (error) {
    console.error("Chyba při načítání pozic:", error)
    return NextResponse.json(
      { error: "Chyba při získávání dat" },
      { status: 500 }
    )
  }
}
