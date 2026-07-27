import { requireInternalUser } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { ReportsHistoryButton } from "@/components/history/reports-history-button"
import { StatistikyClient } from "@/components/statistiky/statistiky-client"

export default async function StatistikyPage() {
  await requireInternalUser()

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden px-3 pb-8 sm:px-4 lg:px-8">
      <DashboardHeader
        heading="Statistiky"
        text="Přehled nástupů, odchodů a změn v čase, zdraví procesu a vlastní pohledy."
      >
        <ReportsHistoryButton scope="statistics" title="Historie statistiky" />
      </DashboardHeader>
      <StatistikyClient />
    </div>
  )
}
