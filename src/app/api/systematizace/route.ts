import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  try {
    const res = await fetch(
      "https://systemizace.kitt6.dev/api/1.0/position/list?detail=1",
      {
        headers: { Accept: "application/json" },
      }
    )

    if (!res.ok) throw new Error("Nepodařilo se načíst pozice ze systemizace.")

    const json = await res.json()
    return NextResponse.json({ data: json.data })
  } catch (error) {
    console.error("Chyba při načítání pozic:", error)
    return NextResponse.json(
      { error: "Chyba při získávání dat" },
      { status: 500 }
    )
  }
}
