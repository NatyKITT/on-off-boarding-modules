import { env } from "@/env.mjs"





export type EosPerson = {
  id?: string
  gid?: string
  number_pers?: string
  given_name?: string
  surname?: string
  email?: string
  title_pre?: string | null
  title_post?: string | null
  role?: {
    code?: string
    name?: string
  } | null
  role_name?: string | null
  dept_name?: string | null
  unit_name?: string | null
  unit?: {
    name?: string | null
    parent_data?: { name?: string | null } | null
  } | null
}

type EosListResponse = {
  data?: unknown
  results?: unknown
}

export type Employee = {
  id: string
  gid: string
  personalNumber: string
  name: string
  surname: string
  email: string
  titleBefore: string | null
  titleAfter: string | null
  positionNum: string
  positionName: string
  department: string
  unitName: string
  userName?: string | null
  label: string
}

const EOS_API_BASE = env.EOS_API_BASE || "https://eos.pha6.cz"
const EOS_API_TOKEN = env.EOS_API_TOKEN || ""

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const guessUserName = (email?: string | null) =>
  email && email.includes("@") ? email.split("@")[0] : null

export function isEosPerson(v: unknown): v is EosPerson {
  if (v == null || typeof v !== "object") return false
  const o = v as Record<string, unknown>

  return (
    (typeof o.gid === "string" && o.gid.length > 0) ||
    (typeof o.id === "string" && o.id.length > 0) ||
    (typeof o.number_pers === "string" && o.number_pers.length > 0)
  )
}

function mapPerson(p: EosPerson): Employee {
  const personalNumber = String(p.number_pers ?? "").trim()
  const positionNum = String(p.role?.code ?? "").trim()
  const positionName = String(p.role_name ?? p.role?.name ?? "").trim()
  const department = String(
    p.dept_name ?? p.unit?.parent_data?.name ?? ""
  ).trim()
  const unitName = String(p.unit_name ?? p.unit?.name ?? "").trim()
  const email = String(p.email ?? "").trim()
  const gid = String(p.gid ?? p.id ?? "").trim()

  const label = `${personalNumber ? `${personalNumber} — ` : ""}${[
    p.title_pre,
    p.given_name,
    p.surname,
    p.title_post,
  ]
    .filter(Boolean)
    .join(" ")}`
    .replace(/\s+/g, " ")
    .trim()

  return {
    id: String(p.gid ?? p.id ?? personalNumber ?? label).trim(),
    gid,
    personalNumber,
    name: String(p.given_name ?? "").trim(),
    surname: String(p.surname ?? "").trim(),
    email,
    titleBefore: p.title_pre ?? null,
    titleAfter: p.title_post ?? null,
    positionNum,
    positionName,
    department,
    unitName,
    userName: guessUserName(email),
    label,
  }
}

async function fetchPeople(url: URL): Promise<Employee[]> {
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      ...(EOS_API_TOKEN ? { Authorization: `Bearer ${EOS_API_TOKEN}` } : {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`EOS hledání selhalo (${res.status}): ${text}`)
  }

  const json = (await res.json()) as EosListResponse

  const raw: unknown = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.results)
      ? json.results
      : []

  return Array.isArray(raw) ? raw.filter(isEosPerson).map(mapPerson) : []
}

export async function getEmployees(query: string): Promise<Employee[]> {
  const q = (query ?? "").trim()
  const digits = q.replace(/\D+/g, "")
  const isNumericSearch = digits.length > 0

  const url = new URL("/api/1.0/person/list/", EOS_API_BASE)
  url.searchParams.set("detail", "1")

  if (q) {
    if (isNumericSearch) {
      url.searchParams.set("number_pers", digits)
    } else {
      const parts = q.split(/\s+/).filter(Boolean)
      const givenName = String(parts[0] ?? "")
      const surname = String(parts.length > 1 ? parts[parts.length - 1] : "")

      if (givenName) url.searchParams.set("given_name", givenName)
      if (surname) url.searchParams.set("surname", surname)
    }
  }

  const mapped = await fetchPeople(url)

  if (!isNumericSearch && q) {
    const fq = fold(q)

    return mapped.filter((e) => {
      const hay = fold(
        `${e.personalNumber} ${e.name} ${e.surname} ${e.positionName} ${e.department} ${e.unitName} ${e.email}`
      )
      return hay.includes(fq)
    })
  }

  return mapped
}

export async function getEmployeesByPersonalNumber(
  digits: string
): Promise<Employee[]> {
  return getEmployees(digits)
}

export async function getEmployeeFromEos(
  query: string
): Promise<Employee | null> {
  const list = await getEmployees(query)
  return list[0] ?? null
}

export async function getEmployeeByGid(gid: string): Promise<Employee | null> {
  const value = gid.trim()
  if (!value) return null

  const url = new URL("/api/1.0/person/list/", EOS_API_BASE)
  url.searchParams.set("detail", "1")
  url.searchParams.set("gid", value)

  try {
    const people = await fetchPeople(url)
    return people.find((p) => p.gid === value) ?? people[0] ?? null
  } catch (error) {
    console.error("Nepodařilo se načíst zaměstnance podle GID:", error)
    return null
  }
}

export async function getEmployeeByPositionNum(
  positionNum: string
): Promise<Employee | null> {
  const code = positionNum.trim()
  if (!code) return null

  const url = new URL("/api/1.0/person/list/", EOS_API_BASE)
  url.searchParams.set("detail", "1")

  try {
    const people = await fetchPeople(url)
    return people.find((p) => p.positionNum === code) ?? null
  } catch (error) {
    console.error("Nepodařilo se načíst zaměstnance podle čísla pozice:", error)
    return null
  }
}
