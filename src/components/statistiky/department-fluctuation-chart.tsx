"use client"

import { useRouter } from "next/navigation"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { StatDatum } from "@/lib/statistics/types"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  value: { label: "Odchody", color: "#d97706" },
} satisfies ChartConfig

type Props = {
  data: StatDatum[]
  year: number
}

export function DepartmentFluctuationChart({ data, year }: Props) {
  const router = useRouter()

  const height = Math.max(220, data.length * 34)

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8 }}
        onClick={(state: unknown) => {
          const point = (
            state as { activePayload?: Array<{ payload?: StatDatum }> }
          )?.activePayload?.[0]?.payload
          if (!point) return
          router.push(
            `/odchody?statYear=${year}&department=${encodeURIComponent(point.label)}`
          )
        }}
      >
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
          cursor="pointer"
        />
      </BarChart>
    </ChartContainer>
  )
}
