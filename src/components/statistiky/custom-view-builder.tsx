"use client"

import { useEffect, useMemo, useState } from "react"
import { Bookmark, Loader2, Trash2 } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { useIsReadonly } from "@/hooks/use-current-role"
import {
  DIMENSION_LABELS,
  DISPLAY_TYPE_LABELS,
  METRIC_ALLOWED_DIMENSIONS,
  METRIC_LABELS,
  type StatDatum,
  type StatDimension,
  type StatDisplayType,
  type StatisticsFilterOptions,
  type StatisticsFilters,
  type StatMetric,
  type StatSection,
} from "@/lib/statistics/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MultiSelectFilter } from "@/components/common/multi-select-filter"

const chartConfig = {
  value: { label: "Hodnota", color: "#00847C" },
} satisfies ChartConfig

const SECTION_OPTIONS: { value: StatSection; label: string }[] = [
  { value: "planned", label: "Plánované" },
  { value: "actual", label: "Skutečné" },
  { value: "cancelled", label: "Neuskutečněné" },
]

type SavedView = {
  id: number
  name: string
  metric: string
  dimension: string
  displayType: string
  filters: StatisticsFilters
}

type Props = {
  baseFilters: StatisticsFilters
  filterOptions: StatisticsFilterOptions
  onStateChange?: (state: {
    metric: StatMetric
    dimension: StatDimension
    filters: StatisticsFilters
    label: string
  }) => void
}

export function CustomViewBuilder({
  baseFilters,
  filterOptions,
  onStateChange,
}: Props) {
  const isReadonly = useIsReadonly()
  const [metric, setMetric] = useState<StatMetric>(
    "offboardingsDuringProbation"
  )
  const [dimension, setDimension] = useState<StatDimension>("positionName")
  const [displayType, setDisplayType] =
    useState<StatDisplayType>("barHorizontal")

  const [department, setDepartment] = useState<string[]>([])
  const [unitName, setUnitName] = useState<string[]>([])
  const [positionName, setPositionName] = useState<string[]>([])
  const [section, setSection] = useState<string[]>([])

  const [data, setData] = useState<StatDatum[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [savingName, setSavingName] = useState("")
  const [saving, setSaving] = useState(false)

  const filters: StatisticsFilters = useMemo(
    () => ({
      ...baseFilters,
      department: department.length ? department : undefined,
      unitName: unitName.length ? unitName : undefined,
      positionName: positionName.length ? positionName : undefined,
      section: section.length ? (section as StatSection[]) : undefined,
    }),
    [baseFilters, department, unitName, positionName, section]
  )

  useEffect(() => {
    onStateChange?.({
      metric,
      dimension,
      filters,
      label: `${METRIC_LABELS[metric]} podle: ${DIMENSION_LABELS[dimension]}`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, dimension, filters])

  const allowedDimensions = METRIC_ALLOWED_DIMENSIONS[metric]

  useEffect(() => {
    if (!allowedDimensions.includes(dimension)) {
      setDimension(allowedDimensions[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set("metric", metric)
        params.set("dimension", dimension)
        params.set("year", String(filters.year))
        if (filters.fromMonth)
          params.set("fromMonth", String(filters.fromMonth))
        if (filters.toMonth) params.set("toMonth", String(filters.toMonth))
        filters.department?.forEach((v) => params.append("department", v))
        filters.unitName?.forEach((v) => params.append("unitName", v))
        filters.positionName?.forEach((v) => params.append("positionName", v))
        filters.section?.forEach((v) => params.append("section", v))

        const res = await fetch(`/api/statistiky/custom?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const json = await res.json().catch(() => null)
        if (!res.ok)
          throw new Error(json?.message ?? "Nepodařilo se načíst pohled.")
        setData(Array.isArray(json?.data) ? json.data : [])
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setError(
          err instanceof Error ? err.message : "Nepodařilo se načíst pohled."
        )
        setData([])
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [metric, dimension, filters])

  useEffect(() => {
    void loadSavedViews()
  }, [])

  async function loadSavedViews() {
    try {
      const res = await fetch("/api/statistiky/views", { cache: "no-store" })
      const json = await res.json().catch(() => null)
      if (res.ok && Array.isArray(json?.data)) {
        setSavedViews(json.data as SavedView[])
      }
    } catch {
      // tichý fallback – uložené pohledy nejsou kritické pro fungování stránky
    }
  }

  async function handleSaveView() {
    if (!savingName.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/statistiky/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savingName.trim(),
          metric,
          dimension,
          displayType,
          filters,
        }),
      })
      if (res.ok) {
        setSavingName("")
        await loadSavedViews()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteView(id: number) {
    await fetch(`/api/statistiky/views/${id}`, { method: "DELETE" })
    await loadSavedViews()
  }

  function applyView(view: SavedView) {
    setMetric(view.metric as StatMetric)
    setDimension(view.dimension as StatDimension)
    setDisplayType(view.displayType as StatDisplayType)
    setDepartment(view.filters.department ?? [])
    setUnitName(view.filters.unitName ?? [])
    setPositionName(view.filters.positionName ?? [])
    setSection(view.filters.section ?? [])
  }

  const departmentOptions = filterOptions.departments.map((v) => ({
    value: v,
    label: v,
  }))
  const unitOptions = filterOptions.unitNames.map((v) => ({
    value: v,
    label: v,
  }))
  const positionOptions = filterOptions.positionNames.map((v) => ({
    value: v,
    label: v,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vlastní pohledy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={metric}
            onValueChange={(v) => setMetric(v as StatMetric)}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METRIC_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={dimension}
            onValueChange={(v) => setDimension(v as StatDimension)}
          >
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedDimensions.map((value) => (
                <SelectItem key={value} value={value}>
                  {DIMENSION_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={displayType}
            onValueChange={(v) => setDisplayType(v as StatDisplayType)}
          >
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DISPLAY_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <MultiSelectFilter
            label="Odbor"
            options={departmentOptions}
            selected={department}
            onChange={setDepartment}
          />
          <MultiSelectFilter
            label="Oddělení"
            options={unitOptions}
            selected={unitName}
            onChange={setUnitName}
          />
          <MultiSelectFilter
            label="Pozice"
            options={positionOptions}
            selected={positionName}
            onChange={setPositionName}
          />
          <MultiSelectFilter
            label="Sekce"
            options={SECTION_OPTIONS}
            selected={section}
            onChange={setSection}
          />
        </div>

        <div className="min-h-[280px] rounded-lg border p-3">
          {loading ? (
            <div className="flex h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Načítám…
            </div>
          ) : error ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-destructive">
              {error}
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              Žádná data pro tento výběr.
            </div>
          ) : displayType === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{DIMENSION_LABELS[dimension]}</TableHead>
                  <TableHead className="text-right">Hodnota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : displayType === "line" ? (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full"
            >
              <LineChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : displayType === "barHorizontal" ? (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto w-full"
              style={{ height: Math.max(220, data.length * 34) }}
            >
              <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="label"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={160}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[280px] w-full"
            >
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </div>

        {!isReadonly && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Input
              placeholder="Název pohledu…"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              className="h-9 w-56"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!savingName.trim() || saving}
              onClick={() => void handleSaveView()}
              className="gap-1"
            >
              <Bookmark className="size-4" />
              Uložit jako oblíbený
            </Button>
          </div>
        )}

        {savedViews.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {savedViews.map((view) => (
              <div
                key={view.id}
                className="flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-xs"
              >
                <button
                  type="button"
                  className="font-medium hover:underline"
                  onClick={() => applyView(view)}
                  title="Načíst pohled"
                >
                  {view.name}
                </button>
                {!isReadonly && (
                  <button
                    type="button"
                    className="rounded-full p-1 text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    onClick={() => void handleDeleteView(view.id)}
                    title="Smazat pohled"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
