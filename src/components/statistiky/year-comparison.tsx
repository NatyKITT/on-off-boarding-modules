"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import type { KpiSummary, StatisticsOverview } from "@/lib/statistics/types"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const MONTH_NAMES = [
  "led",
  "úno",
  "bře",
  "dub",
  "kvě",
  "čvn",
  "čvc",
  "srp",
  "zář",
  "říj",
  "lis",
  "pro",
]

const YEAR_COLORS = [
  "#00847C",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
]

function colorForIndex(index: number) {
  return YEAR_COLORS[index % YEAR_COLORS.length]
}

type Props = {
  overviewsByYear: Record<number, StatisticsOverview>
  years: number[]
}

export function KpiComparisonTable({ overviewsByYear, years }: Props) {
  const sortedYears = [...years].sort((a, b) => b - a)

  const rows: { label: string; get: (k: KpiSummary) => string | number }[] = [
    { label: "Nástupy celkem", get: (k) => k.onboardingsTotal },
    { label: "Odchody celkem", get: (k) => k.offboardingsTotal },
    {
      label: "Čistý přírůstek",
      get: (k) => (k.netGrowth > 0 ? "+" : "") + k.netGrowth,
    },
    {
      label: "Odchody ve zkušební době",
      get: (k) => `${k.offboardingsDuringProbationPercent} %`,
    },
    { label: "Neuskutečněné nástupy", get: (k) => k.onboardingsCancelledTotal },
    {
      label: "Neuskutečněné odchody",
      get: (k) => k.offboardingsCancelledTotal,
    },
  ]

  const currentHeadcount =
    overviewsByYear[sortedYears[0]]?.kpis.currentHeadcount

  return (
    <Card>
      <CardHeader>
        <CardTitle>Srovnání hlavních ukazatelů</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ukazatel</TableHead>
              {sortedYears.map((y) => (
                <TableHead key={y} className="text-right">
                  {y}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell>{row.label}</TableCell>
                {sortedYears.map((y) => {
                  const kpis = overviewsByYear[y]?.kpis
                  return (
                    <TableCell key={y} className="text-right font-mono">
                      {kpis ? row.get(kpis) : "—"}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {currentHeadcount != null && (
          <p className="text-xs text-muted-foreground">
            Aktuální stav zaměstnanců: {currentHeadcount} (k dnešnímu dni,
            nezávisí na vybraném roce)
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function OnboardingsOffboardingsByYearChart({
  overviewsByYear,
  years,
}: Props) {
  const sortedYears = [...years].sort((a, b) => a - b)
  const chartData = sortedYears.map((y) => ({
    year: String(y),
    onboardings: overviewsByYear[y]?.kpis.onboardingsTotal ?? 0,
    offboardings: overviewsByYear[y]?.kpis.offboardingsTotal ?? 0,
  }))

  const chartConfig = {
    onboardings: { label: "Nástupy", color: "#00847C" },
    offboardings: { label: "Odchody", color: "#d97706" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nástupy a odchody — srovnání let</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[280px] w-full"
        >
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="onboardings"
              fill="var(--color-onboardings)"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="offboardings"
              fill="var(--color-offboardings)"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function MonthlyFlowComparisonChart({ overviewsByYear, years }: Props) {
  const sortedYears = [...years].sort((a, b) => a - b)

  const chartData = MONTH_NAMES.map((label, index) => {
    const point: Record<string, number | string> = { monthLabel: label }
    for (const y of sortedYears) {
      const key = `${y}-${String(index + 1).padStart(2, "0")}`
      const match = overviewsByYear[y]?.monthlyFlow.find((m) => m.month === key)
      point[String(y)] = match?.headcount ?? 0
    }
    return point
  })

  const chartConfig = Object.fromEntries(
    sortedYears.map((y, i) => [
      String(y),
      { label: String(y), color: colorForIndex(i) },
    ])
  ) satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vývoj stavu zaměstnanců — srovnání let</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[320px] w-full"
        >
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={32}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {sortedYears.map((y, i) => (
              <Line
                key={y}
                type="monotone"
                dataKey={String(y)}
                stroke={colorForIndex(i)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function DepartmentFluctuationComparisonChart({
  overviewsByYear,
  years,
}: Props) {
  const sortedYears = [...years].sort((a, b) => a - b)

  const departments = Array.from(
    new Set(
      sortedYears.flatMap(
        (y) =>
          overviewsByYear[y]?.departmentFluctuation.map((d) => d.label) ?? []
      )
    )
  ).sort()

  const chartData = departments.map((department) => {
    const point: Record<string, number | string> = { department }
    for (const y of sortedYears) {
      const match = overviewsByYear[y]?.departmentFluctuation.find(
        (d) => d.label === department
      )
      point[String(y)] = match?.value ?? 0
    }
    return point
  })

  const chartConfig = Object.fromEntries(
    sortedYears.map((y, i) => [
      String(y),
      { label: String(y), color: colorForIndex(i) },
    ])
  ) satisfies ChartConfig

  const height = Math.max(220, departments.length * 34)

  if (departments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fluktuace podle odboru — srovnání let</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-10 text-center text-sm text-muted-foreground">
            Žádná data pro vybrané roky.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluktuace podle odboru — srovnání let</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full"
          style={{ height }}
        >
          <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              dataKey="department"
              type="category"
              tickLine={false}
              axisLine={false}
              width={160}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {sortedYears.map((y, i) => (
              <Bar
                key={y}
                dataKey={String(y)}
                fill={colorForIndex(i)}
                radius={[0, 3, 3, 0]}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
