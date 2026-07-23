"use client"

import { useRouter } from "next/navigation"
import {
  Percent,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react"

import type { KpiSummary } from "@/lib/statistics/types"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  kpis: KpiSummary
  year: number
}

export function KpiCards({ kpis, year }: Props) {
  const router = useRouter()

  const cards = [
    {
      label: "Nástupy celkem",
      value: kpis.onboardingsTotal,
      icon: UserPlus,
      onClick: () => router.push(`/nastupy?statYear=${year}`),
    },
    {
      label: "Odchody celkem",
      value: kpis.offboardingsTotal,
      icon: UserMinus,
      onClick: () => router.push(`/odchody?statYear=${year}`),
    },
    {
      label: "Čistý přírůstek",
      value: (kpis.netGrowth > 0 ? "+" : "") + kpis.netGrowth,
      sub: `Aktuální stav: ${kpis.currentHeadcount}`,
      icon: kpis.netGrowth >= 0 ? TrendingUp : TrendingDown,
    },
    {
      label: "Odchody ve zkušební době",
      value: `${kpis.offboardingsDuringProbationPercent} %`,
      icon: Percent,
      onClick: () => router.push(`/odchody?statYear=${year}&statProbation=1`),
    },
    {
      label: "Neuskutečněné nástupy",
      value: kpis.onboardingsCancelledTotal,
      icon: XCircle,
      onClick: () => router.push(`/nastupy?statYear=${year}&status=cancelled`),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        const clickable = Boolean(card.onClick)

        return (
          <Card
            key={card.label}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={card.onClick}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault()
                card.onClick?.()
              }
            }}
            className={
              clickable
                ? "cursor-pointer transition-colors hover:border-[#00847C]/50 hover:bg-[#00847C]/5"
                : undefined
            }
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <Icon className="size-4 shrink-0 text-[#00847C]" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold tracking-tight">
                {card.value}
              </div>
              {card.sub && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {card.sub}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
