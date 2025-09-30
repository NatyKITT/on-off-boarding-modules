"use client"

import { useEffect, useState } from "react"

import { calculateProbationEnd, isManagerPosition } from "@/lib/date-time-utils"

type InitialData = Partial<{
  probationMonths: number
  probationEnd: string
  isManager: boolean
}>

interface UseEmployeeFormProps {
  initialData?: InitialData
  positionName?: string
  startDate?: string | null
}

export const useEmployeeForm = ({
  initialData,
  positionName,
  startDate,
}: UseEmployeeFormProps = {}) => {
  const [probationMonths, setProbationMonths] = useState<number>(
    initialData?.probationMonths ?? 3
  )
  const [probationEnd, setProbationEnd] = useState<string>(
    initialData?.probationEnd ?? ""
  )
  const [isManager, setIsManager] = useState<boolean>(
    initialData?.isManager ?? false
  )

  useEffect(() => {
    if (!positionName) return
    const manager = isManagerPosition(positionName)
    setIsManager(manager)
    setProbationMonths(manager ? 6 : 3)
  }, [positionName])

  useEffect(() => {
    if (!startDate) return
    const next = calculateProbationEnd(startDate, probationMonths)
    setProbationEnd(next)
  }, [startDate, probationMonths])

  const updateProbationPeriod = (months: number) => {
    setProbationMonths(months)
    if (startDate) {
      const next = calculateProbationEnd(startDate, months)
      setProbationEnd(next)
    }
  }

  return {
    probationMonths,
    probationEnd,
    isManager,
    updateProbationPeriod,
    setProbationMonths,
    setProbationEnd,
    setIsManager,
  }
}
