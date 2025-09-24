import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env.mjs"

import { fetchPeopleList, isObj, pickStr, toLower } from "@/lib/eos"

type PersonItem = {
  id: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore: string | null
  titleAfter: string | null
  positionName: string
  department: string
  unitName: string
  label: string
}

export async function GET(req: NextRequest) {
  try {
    if (!env.EOS_API_BASE) {
      return NextResponse.json(
        { status: "error", message: "Chybí EOS_API_BASE." },
        { status: 500 }
      )
    }

    const url = new URL(req.url)
    const qRaw = (url.searchParams.get("q") ?? "").trim()
    const q = toLower(qRaw)
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 30), 1),
      100
    )

    const list = await fetchPeopleList()

    const items: PersonItem[] = list
      .map((raw): PersonItem | null => {
        if (!isObj(raw)) return null

        const id = pickStr(raw, ["id", "uuid", "person_id"])
        const personalNumber = pickStr(raw, [
          "personalNumber",
          "personal_number",
          "osobniCislo",
          "osobni_cislo",
          "personalNumber",
        ])
        const name = pickStr(raw, ["name", "jmeno"])
        const surname = pickStr(raw, ["surname", "prijmeni"])
        const email = pickStr(raw, ["email"])
        const titleBefore = pickStr(raw, ["titleBefore", "titulPred"]) || null
        const titleAfter = pickStr(raw, ["titleAfter", "titulZa"]) || null
        const positionName = pickStr(raw, ["positionName", "pozice"])
        const department = pickStr(raw, ["department", "odbor"])
        const unitName = pickStr(raw, ["unitName", "oddeleni"])

        if (!id && !personalNumber && !email) return null

        const fullName = [titleBefore || "", name, surname, titleAfter || ""]
          .filter(Boolean)
          .join(" ")
          .trim()
        const label = `${personalNumber ? personalNumber + " — " : ""}${fullName || email}`

        return {
          id: id || personalNumber || email,
          personalNumber,
          name,
          surname,
          email,
          titleBefore,
          titleAfter,
          positionName,
          department,
          unitName,
          label,
        }
      })
      .filter((x): x is PersonItem => Boolean(x))

    const qDigits = q.replace(/\D+/g, "")
    const filtered = q
      ? items.filter((p) => {
          const hay = toLower(
            `${p.personalNumber} ${p.name} ${p.surname} ${p.email} ${p.label}`
          )
          const hayDigits = (p.personalNumber || "").replace(/\D+/g, "")
          return hay.includes(q) || (qDigits && hayDigits.includes(qDigits))
        })
      : items

    return NextResponse.json({
      status: "success",
      data: filtered.slice(0, limit),
    })
  } catch (e) {
    console.error("GET /api/zamestnanci/hledat error:", e)
    return NextResponse.json(
      { status: "error", message: "Vyhledávání selhalo." },
      { status: 500 }
    )
  }
}
