"use client"

import type { ProcessHealth } from "@/lib/statistics/types"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Props = {
  processHealth: ProcessHealth
}

export function ProcessHealthCards({ processHealth }: Props) {
  const cards = [
    {
      label: "Formuláře vyplněné včas",
      value: `${processHealth.documentsCompletedOnTimePercent} %`,
    },
    {
      label: "Dokončená hodnocení zkušebky",
      value: `${processHealth.probationEvaluationsCompletedPercent} %`,
      sub:
        processHealth.probationEvaluationsAvgDays != null
          ? `Průměrně ${processHealth.probationEvaluationsAvgDays} dní od odeslání`
          : undefined,
    },
    {
      label: "Výstupní listy podepsané všemi",
      value: `${processHealth.exitChecklistsFullySignedPercent} %`,
    },
    {
      label: "Odchylka nástupu (plán vs. skutečnost)",
      value:
        processHealth.avgStartDeviationDays != null
          ? `${processHealth.avgStartDeviationDays} dní`
          : "—",
    },
    {
      label: "Odchylka odchodu (plán vs. skutečnost)",
      value:
        processHealth.avgEndDeviationDays != null
          ? `${processHealth.avgEndDeviationDays} dní`
          : "—",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-bold tracking-tight">{card.value}</div>
            {card.sub && (
              <p className="mt-0.5 text-xs text-muted-foreground">{card.sub}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
