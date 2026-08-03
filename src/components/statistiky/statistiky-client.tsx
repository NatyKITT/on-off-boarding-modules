"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { useSessionStorageState } from "@/hooks/use-session-storage-state"
import type {
  StatDimension,
  StatisticsFilterOptions,
  StatisticsFilters,
  StatisticsOverview,
  StatMetric,
} from "@/lib/statistics/types"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MultiSelectFilter } from "@/components/common/multi-select-filter"

import { ChangesByTypeChart } from "./changes-by-type-chart"
import { CustomViewBuilder } from "./custom-view-builder"
import { DepartmentFluctuationChart } from "./department-fluctuation-chart"
import { KpiCards } from "./kpi-cards"
import { MonthlyFlowChart } from "./monthly-flow-chart"
import { ProcessHealthCards } from "./process-health-cards"
import { StatistikyExportDialog } from "./statistiky-export-dialog"
import {
  DepartmentFluctuationComparisonChart,
  KpiComparisonTable,
  MonthlyFlowComparisonChart,
  OnboardingsOffboardingsByYearChart,
} from "./year-comparison"

type CustomViewState = {
  metric: StatMetric
  dimension: StatDimension
  filters: StatisticsFilters
  label: string
} | null

const MONTH_NAMES = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
]

type OverviewResponse = StatisticsOverview & {
  filterOptions: StatisticsFilterOptions
}

export function StatistikyClient() {
  const currentYear = new Date().getFullYear()
  const [years, setYears] = useSessionStorageState<number[]>(
    "statistiky:years",
    [currentYear]
  )
  const [fromMonth, setFromMonth] = useSessionStorageState<number | "all">(
    "statistiky:fromMonth",
    "all"
  )
  const [toMonth, setToMonth] = useSessionStorageState<number | "all">(
    "statistiky:toMonth",
    "all"
  )

  const [overviewsByYear, setOverviewsByYear] = useState<
    Record<number, OverviewResponse>
  >({})
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [customView, setCustomView] = useState<CustomViewState>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          years.map(async (y) => {
            const params = new URLSearchParams()
            params.set("year", String(y))
            if (fromMonth !== "all") params.set("fromMonth", String(fromMonth))
            if (toMonth !== "all") params.set("toMonth", String(toMonth))

            const res = await fetch(`/api/statistiky?${params.toString()}`, {
              cache: "no-store",
              signal: controller.signal,
            })
            const json = await res.json().catch(() => null)
            if (!res.ok)
              throw new Error(
                json?.message ?? `Nepodařilo se načíst statistiky pro rok ${y}.`
              )
            return [y, json.data as OverviewResponse] as const
          })
        )

        const next: Record<number, OverviewResponse> = {}
        for (const [y, data] of results) next[y] = data
        setOverviewsByYear(next)

        const yearsFromServer = results[0]?.[1]?.filterOptions.years
        if (yearsFromServer?.length) setAvailableYears(yearsFromServer)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setError(
          err instanceof Error
            ? err.message
            : "Nepodařilo se načíst statistiky."
        )
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [years, fromMonth, toMonth])

  const primaryYear = Math.max(...years)
  const primaryOverview = overviewsByYear[primaryYear]
  const isComparing = years.length > 1

  const baseFilters = useMemo(
    () => ({
      year: primaryYear,
      fromMonth: fromMonth === "all" ? undefined : fromMonth,
      toMonth: toMonth === "all" ? undefined : toMonth,
    }),
    [primaryYear, fromMonth, toMonth]
  )

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears]
  )

  function handleYearsChange(values: string[]) {
    if (values.length === 0) return
    setYears(values.map(Number).sort((a, b) => b - a))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectFilter
            label="Roky"
            options={yearOptions}
            selected={years.map(String)}
            onChange={handleYearsChange}
            className="w-[130px]"
          />

          <Select
            value={String(fromMonth)}
            onValueChange={(v) => setFromMonth(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Od začátku</SelectItem>
              {MONTH_NAMES.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(toMonth)}
            onValueChange={(v) => setToMonth(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Do konce</SelectItem>
              {MONTH_NAMES.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {primaryOverview && (
          <StatistikyExportDialog
            year={primaryYear}
            fromMonth={fromMonth === "all" ? undefined : fromMonth}
            toMonth={toMonth === "all" ? undefined : toMonth}
            customView={customView}
          />
        )}
      </div>

      {loading && !primaryOverview ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Načítám statistiky…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : primaryOverview ? (
        <>
          {isComparing ? (
            <>
              <KpiComparisonTable
                overviewsByYear={overviewsByYear}
                years={years}
              />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <OnboardingsOffboardingsByYearChart
                  overviewsByYear={overviewsByYear}
                  years={years}
                />
                <MonthlyFlowComparisonChart
                  overviewsByYear={overviewsByYear}
                  years={years}
                />
              </div>

              <DepartmentFluctuationComparisonChart
                overviewsByYear={overviewsByYear}
                years={years}
              />
            </>
          ) : (
            <>
              <KpiCards kpis={primaryOverview.kpis} year={primaryYear} />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Nástupy a odchody po měsících</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MonthlyFlowChart
                      data={primaryOverview.monthlyFlow}
                      year={primaryYear}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Fluktuace podle odboru</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DepartmentFluctuationChart
                      data={primaryOverview.departmentFluctuation}
                      year={primaryYear}
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                Změny podle typu po měsících
                {isComparing && ` — rok ${primaryYear}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChangesByTypeChart
                data={primaryOverview.changesByTypeMonthly}
                year={primaryYear}
              />
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 text-lg font-semibold">
              Zdraví procesu
              {isComparing && ` — rok ${primaryYear}`}
            </h2>
            <ProcessHealthCards processHealth={primaryOverview.processHealth} />
          </div>

          <CustomViewBuilder
            baseFilters={baseFilters}
            filterOptions={primaryOverview.filterOptions}
            onStateChange={setCustomView}
          />
        </>
      ) : null}
    </div>
  )
}
