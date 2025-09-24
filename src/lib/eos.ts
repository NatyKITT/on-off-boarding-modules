import { env } from "@/env.mjs"

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

export function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return ""
}

export function toLower(s: string) {
  return s.normalize("NFKC").toLowerCase()
}

export async function fetchPeopleList(): Promise<Record<string, unknown>[]> {
  if (!env.EOS_API_BASE) return []
  const url = new URL("/api/1.0/person/list/", env.EOS_API_BASE)
  url.searchParams.set("detail", "1")

  const headers: HeadersInit = {}
  if (env.EOS_API_TOKEN) headers.Authorization = `Bearer ${env.EOS_API_TOKEN}`

  const r = await fetch(url.toString(), { headers, cache: "no-store" })
  if (!r.ok) return []

  const j: unknown = await r.json().catch(() => null)

  if (isObj(j) && Array.isArray((j as { results?: unknown }).results)) {
    return (j as { results: unknown[] }).results.filter(isObj)
  }
  if (Array.isArray(j)) return j.filter(isObj)
  return []
}
