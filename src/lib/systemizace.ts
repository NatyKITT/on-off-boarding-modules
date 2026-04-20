import type { Position } from "@/types/position"





type SystemizacePersonData = {
  gid?: string | null
  name?: string | null
  num?: string | null
}

type SystemizacePositionItem = {
  id?: string
  gid?: string
  handle?: string

  num?: string
  name?: string

  dept?: string
  dept_name?: string

  unit?: string
  unit_name?: string

  lead?: string
  category?: string
  pay_grade?: string

  person_data?: SystemizacePersonData | null
}

type SystemizaceResponse = {
  data?: SystemizacePositionItem[]
}

const SYSTEMIZACE_URL =
  "https://systemizace.kitt6.dev/api/1.0/position/list?detail=1"

export async function getPositions(): Promise<Position[]> {
  const res = await fetch(SYSTEMIZACE_URL, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error("Chyba při načítání dat ze systemizace")
  }

  const json = (await res.json()) as SystemizaceResponse
  const items = Array.isArray(json.data) ? json.data : []

  return items
    .filter((item) => typeof item.num === "string" && item.num.trim() !== "")
    .map(
      (item): Position => ({
        id: item.id ?? item.num ?? "",
        gid: item.gid ?? undefined,
        handle: item.handle ?? undefined,

        num: item.num?.trim() ?? "",
        name: item.name?.trim() ?? "",
        dept_name: item.dept_name?.trim() ?? "",
        unit_name: item.unit_name?.trim() ?? "",

        dept: item.dept ?? undefined,
        unit: item.unit ?? undefined,
        lead: item.lead ?? undefined,
        category: item.category ?? undefined,
        pay_grade: item.pay_grade ?? undefined,

        personName: item.person_data?.name?.trim() ?? undefined,
        personPersonalNumber: item.person_data?.num?.trim() ?? undefined,
        personGid: item.person_data?.gid?.trim() ?? undefined,

        supervisorName: undefined,
        supervisorEmail: undefined,
      })
    )
}
