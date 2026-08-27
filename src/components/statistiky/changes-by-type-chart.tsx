"use client"

import { useRouter } from "next/navigation"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { ChangesByTypeMonthPoint } from "@/lib/statistics/types"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

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

function formatMonth(month: string) {
  const [, m] = month.split("-")
  const index = Number(m) - 1
  return MONTH_NAMES[index] ?? month
}

const chartConfig = {
  POSITION: { label: "Změna pozice", color: "#00847C" },
  NAME: { label: "Změna jména", color: "#2563eb" },
  NAME_AND_POSITION: { label: "Jméno i pozice", color: "#d97706" },
  MATERNITY_LEAVE: { label: "Mateřská dovolená", color: "#db2777" },
} satisfies ChartConfig

type Props = {
  data: ChangesByTypeMonthPoint[]
  year: number
}

export function ChangesByTypeChart({ data, year }: Props) {
  const router = useRouter()

  const chartData = data.map((point) => ({
    ...point,
    monthLabel: formatMonth(point.month),
  }))

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[320px] w-full"
    >
      <BarChart
        data={chartData}
        onClick={(state: unknown) => {
          const point = (
            state as {
              activePayload?: Array<{
                payload?: ChangesByTypeMonthPoint & { monthLabel: string }
              }>
            }
          )?.activePayload?.[0]?.payload
          if (!point) return
          router.push(`/zmeny?statYear=${year}&statMonth=${point.month}`)
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="monthLabel"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="POSITION"
          stackId="changes"
          fill="var(--color-POSITION)"
          cursor="pointer"
        />
        <Bar
          dataKey="NAME"
          stackId="changes"
          fill="var(--color-NAME)"
          cursor="pointer"
        />
        <Bar
          dataKey="NAME_AND_POSITION"
          stackId="changes"
          fill="var(--color-NAME_AND_POSITION)"
          cursor="pointer"
        />
        <Bar
          dataKey="MATERNITY_LEAVE"
          stackId="changes"
          fill="var(--color-MATERNITY_LEAVE)"
          radius={[3, 3, 0, 0]}
          cursor="pointer"
        />
      </BarChart>
    </ChartContainer>
  )
}
