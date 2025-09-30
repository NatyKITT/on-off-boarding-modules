import React, { useCallback, useEffect, useState } from "react"

import { formatDateEuropean, formatTimeEuropean } from "@/lib/date-time-utils"

import { ProbationProgressBar } from "@/components/ui/probation-progress-bar"

interface Employee {
  id: number
  name: string
  surname: string
  positionName: string
  personalNumber: string | null
  actualStart: string | null
  plannedStart: string | null
  startTime: string | null
  probationPeriodEnd: string | null
  isManager: boolean
  status: string
}

interface TimeSlot {
  [time: string]: Employee[]
}

interface DayScheduleViewProps {
  date: string
  className?: string
}

export const DayScheduleView: React.FC<DayScheduleViewProps> = ({
  date,
  className = "",
}) => {
  const [timeSlots, setTimeSlots] = useState<TimeSlot>({})
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true)
      const controller = new AbortController()
      const res = await fetch(`/api/employees/schedule/${date}`, {
        signal: controller.signal,
      })
      const data = await res.json()

      if (data.success) {
        setTimeSlots(data.time_slots)
        setTotalCount(data.count)
        setError(null)
      } else {
        setError(data.message || "Chyba při načítání rozvrhu")
      }
    } catch (err) {
      setError("Chyba při načítání rozvrhu")
      console.error("Error fetching schedule:", err)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  if (loading) {
    return (
      <div className={`rounded-lg bg-white p-6 shadow-sm ${className}`}>
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/3 rounded bg-gray-200"></div>
          <div className="space-y-3">
            <div className="h-3 rounded bg-gray-200"></div>
            <div className="h-3 w-5/6 rounded bg-gray-200"></div>
            <div className="h-3 w-4/6 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`rounded-lg bg-white p-6 shadow-sm ${className}`}>
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-lg bg-white shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {formatDateEuropean(date)}
          </h3>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            {totalCount} {totalCount === 1 ? "nástup" : "nástupů"}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {Object.keys(timeSlots).length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <div className="mb-2 text-4xl">📅</div>
            <p className="text-lg">Žádné nástupy v tento den</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(timeSlots)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([time, employees]) => (
                <div key={time} className="overflow-hidden rounded-lg border">
                  {/* Time Header */}
                  <div className="border-b bg-gray-100 px-4 py-3">
                    <h4 className="text-lg font-semibold text-gray-900">
                      {formatTimeEuropean(time)}
                    </h4>
                  </div>

                  {/* Employees List */}
                  <div className="divide-y divide-gray-200">
                    {employees.map((employee) => {
                      const startDate =
                        employee.actualStart || employee.plannedStart

                      return (
                        <div
                          key={employee.id}
                          className="p-4 transition-colors hover:bg-gray-50"
                        >
                          <div className="mb-3 flex items-start justify-between">
                            <div>
                              <div className="mb-1 flex items-center gap-2">
                                <h5 className="font-semibold text-gray-900">
                                  {employee.name} {employee.surname}
                                </h5>
                                <span className="text-sm text-gray-500">
                                  ({formatTimeEuropean(employee.startTime)})
                                </span>
                                {employee.isManager && (
                                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                                    Vedoucí
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <span>{employee.positionName}</span>
                                {employee.personalNumber && (
                                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                                    #{employee.personalNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Progress Bar pro zkušební dobu */}
                          {employee.probationPeriodEnd && startDate && (
                            <ProbationProgressBar
                              startDate={startDate}
                              probationEndDate={employee.probationPeriodEnd}
                              variant={
                                employee.actualStart ? "actual" : "planned"
                              }
                              label="Zkušební doba"
                              size="sm"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
