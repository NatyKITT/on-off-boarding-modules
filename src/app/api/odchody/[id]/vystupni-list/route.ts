import fs from "fs/promises"
import path from "path"

import { NextRequest } from "next/server"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument } from "pdf-lib"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Departure = {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  department?: string | null
  unitName?: string | null
  personalNumber?: string | null
  plannedEnd: string
  actualEnd?: string | null
}

const nfc = (s?: string | null) => (s ?? "").normalize("NFC")

async function getDepartureById(
  id: number,
  cookie: string | null
): Promise<Departure> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"
  const res = await fetch(`${base}/api/odchody/${id}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  })
  if (!res.ok)
    throw new Error(
      `Nelze načíst data odchodu (GET ${base}/api/odchody/${id} => ${res.status}).`
    )
  const json = await res.json()
  return json.data as Departure
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = u8
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id)
    const cookie = req.headers.get("cookie") ?? null

    const tplPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "docs",
      "vystupni-list.pdf"
    )
    const fontPath = path.join(
      process.cwd(),
      "public",
      "assets",
      "fonts",
      "NotoSans-Regular.ttf"
    )

    const [tplBytes, fontBytes, d] = await Promise.all([
      fs.readFile(tplPath),
      fs.readFile(fontPath),
      getDepartureById(id, cookie),
    ])

    const pdf = await PDFDocument.load(tplBytes)
    pdf.registerFontkit(fontkit)
    const cz = await pdf.embedFont(fontBytes, { subset: false })
    const fullName = [
      nfc(d.titleBefore),
      nfc(d.name),
      nfc(d.surname),
      nfc(d.titleAfter),
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    const dept = nfc(d.department)
    const unit = nfc(d.unitName)
    const osobni = nfc(d.personalNumber)

    const end = new Date(d.actualEnd ?? d.plannedEnd)
    const endStr = `${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`

    const page = pdf.getPage(0)
    const draw = (t: string, x: number, y: number, size = 11) =>
      page.drawText(t.normalize("NFC"), { x, y, size, font: cz })

    draw(fullName, 120, 742)
    draw(osobni, 500, 742)
    draw(dept, 120, 714)
    draw(unit, 120, 698)
    draw(endStr, 270, 670)

    const u8 = await pdf.save()
    return new Response(toArrayBuffer(u8), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Vystupni-list-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[vystupni-list] ERROR:", message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
