import type { Position } from "@/types/position"

import {
  getEmployeesByPersonalNumber,
  type Employee,
} from "@/lib/eos-employees"
import { getSuperiorByPersonalNumber } from "@/lib/eos-superior"
import {
  snapshotFromEmployee,
  snapshotFromSuperior,
  toSupervisorFields,
  type PersonSnapshot,
} from "@/lib/person-snapshot"
import { getPositions } from "@/lib/systemizace"

const DEPARTMENT_HEAD_UNIT_NAME = "Vedoucí odboru"

// Číslo pozice se mezi systemizací a EOS neshoduje spolehlivě (např. pozice
// "000001" je v systemizaci tajemník, ale v EOS má kód "000001" starosta -
// tajemník tam má úplně jiný kód). Jediný identifikátor, který sedí v obou
// systémech stejně, je osobní číslo aktuálně přiřazené osoby.
async function findEosEmployeeForPosition(
  position: Position
): Promise<Employee | null> {
  const personalNumber = position.personPersonalNumber?.trim()
  if (!personalNumber) return null

  const matches = await getEmployeesByPersonalNumber(personalNumber)

  return (
    matches.find((e) => e.personalNumber === personalNumber) ??
    matches[0] ??
    null
  )
}

export async function resolveSupervisorFromPositionNum(positionNum: string) {
  try {
    const normalizedPositionNum = positionNum.trim()
    if (!normalizedPositionNum) {
      return null
    }

    const positions = await getPositions()
    const target = positions.find((p) => p.num === normalizedPositionNum)

    if (!target) {
      console.warn(
        `Pozice ${normalizedPositionNum} nebyla nalezena v systemizaci`
      )
      return null
    }

    const departmentHeadPosition = positions.find(
      (p) =>
        p.lead === "1" &&
        p.dept_name === target.dept_name &&
        p.unit_name === DEPARTMENT_HEAD_UNIT_NAME &&
        p.num !== target.num
    )

    if (departmentHeadPosition) {
      const employee = await findEosEmployeeForPosition(departmentHeadPosition)

      if (!employee) {
        console.warn(
          `Vedoucí odboru na pozici ${departmentHeadPosition.num} (${departmentHeadPosition.name}) nemá v EOS obsazenou osobu`
        )
        return null
      }

      const snapshot = snapshotFromEmployee(employee, "EOS")

      return {
        snapshot,
        fields: toSupervisorFields(snapshot, false),
      }
    }

    // Cílová pozice je sama vedoucí odboru (případně tajemník) - systemizace
    // neobsahuje hierarchii mezi odbory, takže se nadřízený dohledá přes
    // skutečnou organizační strukturu v EOS (vedoucí odboru -> tajemník ->
    // starosta), podle osobního čísla aktuální osoby na pozici.
    const personalNumber = target.personPersonalNumber?.trim()

    if (!personalNumber) {
      console.warn(
        `Pozice ${normalizedPositionNum} nemá v systemizaci přiřazené osobní číslo, nelze dohledat nadřízeného`
      )
      return null
    }

    const superior = await getSuperiorByPersonalNumber(personalNumber)

    if (!superior) {
      console.warn(
        `EOS nevrátil nadřízeného pro pozici ${normalizedPositionNum}`
      )
      return null
    }

    const snapshot = snapshotFromSuperior(superior, "EOS")

    return {
      snapshot,
      fields: toSupervisorFields(snapshot, false),
    }
  } catch (error) {
    console.error(
      `Chyba při dohledání vedoucího pro pozici ${positionNum}:`,
      error
    )
    return null
  }
}

// Tajemník nemá v systemizaci/EOS spolehlivě konzistentní kód pozice
// (viz komentář u findEosEmployeeForPosition výše), ale je nadřízeným
// úplně každého vedoucího odboru. Stačí tedy najít libovolného aktuálně
// obsazeného vedoucího odboru a dohledat jeho nadřízeného v EOS -
// výsledek je vždy aktuální tajemník, i po personální změně.
export async function resolveTajemnik(): Promise<PersonSnapshot | null> {
  try {
    const positions = await getPositions()

    const departmentHead = positions.find(
      (p) =>
        p.lead === "1" &&
        p.unit_name === DEPARTMENT_HEAD_UNIT_NAME &&
        p.personPersonalNumber?.trim()
    )

    const personalNumber = departmentHead?.personPersonalNumber?.trim()

    if (!personalNumber) {
      console.warn(
        "Nepodařilo se najít žádného obsazeného vedoucího odboru pro dohledání tajemníka"
      )
      return null
    }

    const superior = await getSuperiorByPersonalNumber(personalNumber)

    if (!superior) {
      console.warn("EOS nevrátil nadřízeného (tajemníka) pro vedoucího odboru")
      return null
    }

    return snapshotFromSuperior(superior, "EOS")
  } catch (error) {
    console.error("Chyba při dohledání tajemníka:", error)
    return null
  }
}
