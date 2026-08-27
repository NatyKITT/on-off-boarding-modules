import { NextRequest, NextResponse } from "next/server"

import { buildIcsCalendar } from "@/lib/calendar-link"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const MAX_TEXT_LENGTH = 300

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams
    .get("title")
    ?.trim()
    .slice(0, MAX_TEXT_LENGTH)
  const date = request.nextUrl.searchParams.get("date")?.trim()
  const description = request.nextUrl.searchParams
    .get("description")
    ?.trim()
    .slice(0, MAX_TEXT_LENGTH)

  if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      {
        status: "error",
        message: "Neplatné parametry pro kalendářovou událost.",
      },
      { status: 400 }
    )
  }

  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { status: "error", message: "Neplatné datum." },
      { status: 400 }
    )
  }

  const ics = buildIcsCalendar([{ title, description, date }])

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="udalost-${date}.ics"`,
      "Cache-Control": "no-store",
    },
  })
}
