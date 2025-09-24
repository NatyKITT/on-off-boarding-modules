export type Position = {
  id: string
  num: string
  name: string
  payGrade: string
  deptId: string
  deptName: string
  unitId: string
  unitName: string
}

type PositionAPIItem = {
  id: string
  num: string
  name: string
  pay_grade: string
  dept: string
  dept_name?: string
  unit: string
  unit_name?: string
}

type PositionAPIResponse = {
  data: PositionAPIItem[]
}

export async function getPositions(): Promise<Position[]> {
  const res = await fetch(
    "https://systemizace.kitt6.dev/api/1.0/position/list?detail=1"
  )
  if (!res.ok) throw new Error("Chyba při načítání dat ze systemizace")

  const json: PositionAPIResponse = await res.json()

  return json.data.map(
    (item): Position => ({
      id: item.id,
      num: item.num,
      name: item.name,
      payGrade: item.pay_grade,
      deptId: item.dept,
      deptName: item.dept_name ?? "Neznámý odbor",
      unitId: item.unit,
      unitName: item.unit_name ?? "Neznámé oddělení",
    })
  )
}
