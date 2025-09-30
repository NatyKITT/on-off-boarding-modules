import { getEmployees, type Employee } from "@/lib/eos-employees"

export async function validateEmployeeExists(
  personalNumber: string
): Promise<boolean> {
  try {
    const employees = await getEmployees(personalNumber)
    return employees.some((emp) => emp.personalNumber === personalNumber)
  } catch (error) {
    console.warn("EOS validation failed:", error)
    return false
  }
}

export async function getEmployeeFromEos(
  personalNumber: string
): Promise<Employee | null> {
  try {
    const employees = await getEmployees(personalNumber)
    return (
      employees.find((emp) => emp.personalNumber === personalNumber) ?? null
    )
  } catch (error) {
    console.error("Failed to fetch employee from EOS:", error)
    return null
  }
}

export async function getMultipleEmployeesFromEos(
  personalNumbers: string[]
): Promise<Map<string, Employee>> {
  const results = new Map<string, Employee>()
  const chunks = personalNumbers.reduce<string[][]>((acc, num, i) => {
    const idx = Math.floor(i / 10)
    ;(acc[idx] ??= []).push(num)
    return acc
  }, [])

  for (const chunk of chunks) {
    await Promise.allSettled(
      chunk.map(async (personalNumber) => {
        try {
          const emp = await getEmployeeFromEos(personalNumber)
          if (emp) results.set(personalNumber, emp)
        } catch (err) {
          console.warn(`Failed to fetch employee ${personalNumber}:`, err)
        }
      })
    )
  }
  return results
}
