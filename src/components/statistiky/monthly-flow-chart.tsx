"use client"

import { useRouter } from "next/navigation"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import type { MonthlyFlowPoint } from "@/lib/statistics/types"

import {
  ChartContainer,
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
  onboardings: { label: "Nástupy", color: "#00847C" },
  offboardings: { label: "Odchody", color: "#d97706" },
  headcount: { label: "Stav zaměstnanců", color: "#1d4ed8" },
} satisfies ChartConfig

type Props = {
  data: MonthlyFlowPoint[]
  year: number
}

export function MonthlyFlowChart({ data, year }: Props) {
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
      <ComposedChart
        data={chartData}
        onClick={(state: unknown) => {
          const point = (
            state as {
              activePayload?: Array<{
                payload?: MonthlyFlowPoint & { monthLabel: string }
              }>
            }
          )?.activePayload?.[0]?.payload
          if (!point) return
          router.push(`/nastupy?statYear=${year}&statMonth=${point.month}`)
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
        <Bar
          dataKey="onboardings"
          fill="var(--color-onboardings)"
          radius={[3, 3, 0, 0]}
          cursor="pointer"
        />
        <Bar
          dataKey="offboardings"
          fill="var(--color-offboardings)"
          radius={[3, 3, 0, 0]}
          cursor="pointer"
        />
        <Line
          type="monotone"
          dataKey="headcount"
          stroke="var(--color-headcount)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
