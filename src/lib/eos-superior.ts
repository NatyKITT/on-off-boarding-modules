import { env } from "@/env.mjs"

import {
  getEmployeeByGid,
  getEmployeesByPersonalNumber,
} from "@/lib/eos-employees"

const EOS_API_BASE = env.EOS_API_BASE || "https://eos.pha6.cz"
const EOS_API_TOKEN = env.EOS_API_TOKEN || ""

export type EosSuperior = {
  gid: string
  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  email: string | null
  personalNumber: string | null
  fullName: string
  positionNum: string | null
  positionName: string | null
  department: string | null
  unitName: string | null
}

type EosSuperiorApiPerson = {
  gid?: string
  surname?: string
  given_name?: string
  email?: string | null
  title_pre?: string | null
  title_post?: string | null
  number_pers?: string | null
  role_name?: string | null
  dept_name?: string | null
  unit_name?: string | null
}

type EosSuperiorApiResponse = {
  data?: EosSuperiorApiPerson | null
  result?: {
    code?: number
    message?: string
  }
  status?: string
  message?: string
}

export async function getSuperiorByGid(
  gid: string
): Promise<EosSuperior | null> {
  const value = gid.trim()
  if (!value) return null

  try {
    const url = `${EOS_API_BASE}/api/1.0/person/superior/${encodeURIComponent(value)}`

    const response = await fetch(url, {
      headers: {
        ...(EOS_API_TOKEN ? { Authorization: `Bearer ${EOS_API_TOKEN}` } : {}),
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      console.error(`EOS superior API error: ${response.status}`, text)
      return null
    }

    const json = (await response
      .json()
      .catch(() => null)) as EosSuperiorApiResponse | null

    const data = json?.data
    const superiorGid = String(data?.gid ?? "").trim()

    if (!superiorGid) {
      console.error("EOS superior API: chybí data.gid pro vstupní gid:", value)
      return null
    }

    const enriched = await getEmployeeByGid(superiorGid)

    if (enriched) {
      return {
        gid: enriched.gid,
        titleBefore: enriched.titleBefore ?? null,
        name: enriched.name,
        surname: enriched.surname,
        titleAfter: enriched.titleAfter ?? null,
        email: enriched.email || null,
        personalNumber: enriched.personalNumber || null,
        fullName: [
          enriched.titleBefore,
          enriched.name,
          enriched.surname,
          enriched.titleAfter,
        ]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
        positionNum: enriched.positionNum || null,
        positionName: enriched.positionName || null,
        department: enriched.department || null,
        unitName: enriched.unitName || null,
      }
    }

    const name = String(data?.given_name ?? "").trim()
    const surname = String(data?.surname ?? "").trim()
    const titleBefore = data?.title_pre ?? null
    const titleAfter = data?.title_post ?? null

    return {
      gid: superiorGid,
      titleBefore,
      name,
      surname,
      titleAfter,
      email: data?.email ?? null,
      personalNumber: data?.number_pers ?? null,
      fullName: [titleBefore, name, surname, titleAfter]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
      positionNum: null,
      positionName: data?.role_name ?? null,
      department: data?.dept_name ?? null,
      unitName: data?.unit_name ?? null,
    }
  } catch (error) {
    console.error("Chyba při načítání vedoucího z EOS:", error)
    return null
  }
}

export async function getSuperiorByPersonalNumber(
  personalNumber: string
): Promise<EosSuperior | null> {
  const value = personalNumber.trim()
  if (!value) return null

  try {
    const employees = await getEmployeesByPersonalNumber(value)
    const employee =
      employees.find((item) => item.personalNumber === value) ??
      employees[0] ??
      null

    if (!employee?.gid) {
      return null
    }

    return await getSuperiorByGid(employee.gid)
  } catch (error) {
    console.error("Chyba při načítání vedoucího podle osobního čísla:", error)
    return null
  }
}
