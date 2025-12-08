export type EosPerson = {
  id?: string
  gid?: string
  number_pers?: string
  given_name?: string
  surname?: string
  email?: string
  title_pre?: string | null
  title_post?: string | null
  role?: { code?: string; name?: string } | null
  role_name?: string | null
  dept_name?: string | null
  unit_name?: string | null
  unit?: {
    name?: string | null
    parent_data?: { name?: string | null } | null
  } | null
}

export type EosListResponse = { data?: unknown }

export function isEosPerson(v: unknown): v is EosPerson {
  if (v == null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    (typeof o.number_pers === "string" && o.number_pers.length > 0) ||
    (typeof o.gid === "string" && o.gid.length > 0) ||
    (typeof o.id === "string" && o.id.length > 0)
  )
}

export type Employee = {
  id: string
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

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const guessUserName = (email?: string | null) =>
  email && email.includes("@") ? email.split("@")[0] : null

export async function getEmployees(query: string): Promise<Employee[]> {
  const q = (query ?? "").trim()
  const digits = q.replace(/\D+/g, "")
  const isNumericSearch = digits.length >= 1

  const url = new URL("https://eos.pha6.cz/api/1.0/person/list/")
  url.searchParams.set("detail", "1")

  if (isNumericSearch) {
    url.searchParams.set("number_pers", String(digits))
  } else {
    const parts = q.split(/\s+/).filter(Boolean)
    const gn = String(parts[0] ?? "")
    const sn = String(parts.length > 1 ? parts[parts.length - 1] : "")
    if (gn) url.searchParams.set("given_name", gn)
    if (sn) url.searchParams.set("surname", sn)
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`EOS hledání selhalo (${res.status}): ${t}`)
  }

  const j: EosListResponse = await res.json()
  const arr: unknown = j?.data
  const people: EosPerson[] = Array.isArray(arr) ? arr.filter(isEosPerson) : []

  const mapped = people.map((p): Employee => {
    const personalNumber = String(p.number_pers ?? "")
    const positionNum = String(p?.role?.code ?? "")
    const positionName = String(p?.role_name ?? p?.role?.name ?? "")
    const department = String(p?.dept_name ?? p?.unit?.parent_data?.name ?? "")
    const unitName = String(p?.unit_name ?? p?.unit?.name ?? "")
    const email = String(p.email ?? "")

    const label = `${personalNumber ? personalNumber + " — " : ""}${[
      p.title_pre,
      p.given_name,
      p.surname,
      p.title_post,
    ]
      .filter(Boolean)
      .join(" ")}`.trim()

    return {
      id: String(p.gid || p.id || personalNumber || label),
      personalNumber,
      name: String(p.given_name ?? ""),
      surname: String(p.surname ?? ""),
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
  })

  if (!isNumericSearch && q) {
    const fq = fold(q)
    return mapped.filter((e) => {
      const hay = fold(
        `${e.personalNumber} ${e.name} ${e.surname} ${e.positionName} ${e.department} ${e.unitName}`
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
