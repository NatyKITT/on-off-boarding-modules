import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env.mjs"

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

async function fetchList(): Promise<Record<string, unknown>[]> {
  const listUrl = new URL("/api/1.0/person/list/", env.EOS_API_BASE!)
  listUrl.searchParams.set("detail", "1")

  const headers: HeadersInit = {}
  if (env.EOS_API_TOKEN) headers.Authorization = `Bearer ${env.EOS_API_TOKEN}`

  const r = await fetch(listUrl.toString(), { headers, cache: "no-store" })
  if (!r.ok) return []

  const j: unknown = await r.json().catch(() => null)

  if (isObj(j) && Array.isArray((j as { results?: unknown }).results)) {
    return (j as { results: unknown[] }).results.filter(isObj)
  }

  if (Array.isArray(j)) {
    return j.filter(isObj)
  }

  return []
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
    const id = (url.searchParams.get("id") ?? "").trim() // např. "pers-..."
    const personalNumber = (url.searchParams.get("personalNumber") ?? "").trim()

    let resolvedId = id

    if (!resolvedId && personalNumber) {
      const items = await fetchList()
      const match = items.find((raw: Record<string, unknown>) => {
        const pn = pickStr(raw, [
          "personalNumber",
          "personal_number",
          "osobniCislo",
          "osobni_cislo",
          "personalNumber",
        ])
        return pn === personalNumber
      })
      if (match) {
        resolvedId = pickStr(match, ["id", "uuid", "person_id"]) || "" // pokud by chybělo, zůstane prázdné
      }
    }

    if (!resolvedId) {
      return NextResponse.json(
        { status: "error", message: "Chybí id nebo personalNumber." },
        { status: 400 }
      )
    }

    const detailUrl = new URL(
      `/api/1.0/person/detail/${resolvedId}/`,
      env.EOS_API_BASE
    )
    detailUrl.searchParams.set("detail", "1")

    const headers: HeadersInit = {}
    if (env.EOS_API_TOKEN) headers.Authorization = `Bearer ${env.EOS_API_TOKEN}`

    const res = await fetch(detailUrl.toString(), {
      headers,
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: "EOS detail nedostupný." },
        { status: 502 }
      )
    }

    const data: unknown = await res.json().catch(() => null)
    return NextResponse.json({ status: "success", data })
  } catch (e) {
    console.error("GET /api/zamestnanci/detail error:", e)
    return NextResponse.json(
      { status: "error", message: "Načtení detailu selhalo." },
      { status: 500 }
    )
  }
}
