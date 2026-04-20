import { getEmployeeByPositionNum } from "@/lib/eos-employees"
import { getSuperiorByGid } from "@/lib/eos-superior"
import { snapshotFromSuperior, toSupervisorFields } from "@/lib/person-snapshot"

export async function resolveSupervisorFromPositionNum(positionNum: string) {
  try {
    const normalizedPositionNum = positionNum.trim()
    if (!normalizedPositionNum) {
      return null
    }

    const employee = await getEmployeeByPositionNum(normalizedPositionNum)

    if (!employee?.gid) {
      console.warn(
        `V EOS nebyla nalezena osoba pro pozici ${normalizedPositionNum}`
      )
      return null
    }

    const superior = await getSuperiorByGid(employee.gid)

    if (!superior) {
      console.warn(
        `Pro osobu na pozici ${normalizedPositionNum} s GID ${employee.gid} nebyl v EOS nalezen vedoucí`
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
