"use client"

import { useState } from "react"
import { Download, Loader2, Send } from "lucide-react"

import type {
  StatDimension,
  StatisticsFilters,
  StatMetric,
} from "@/lib/statistics/types"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type CustomViewState = {
  metric: StatMetric
  dimension: StatDimension
  filters: StatisticsFilters
  label: string
} | null

type Props = {
  year: number
  fromMonth?: number
  toMonth?: number
  customView?: CustomViewState
}

export function StatistikyExportDialog({
  year,
  fromMonth,
  toMonth,
  customView,
}: Props) {
  const [open, setOpen] = useState(false)
  const [includeKpis, setIncludeKpis] = useState(true)
  const [includeMonthlyFlow, setIncludeMonthlyFlow] = useState(true)
  const [includeDepartmentFluctuation, setIncludeDepartmentFluctuation] =
    useState(true)
  const [includeChangesByType, setIncludeChangesByType] = useState(false)
  const [includeProcessHealth, setIncludeProcessHealth] = useState(false)
  const [includeDataTable, setIncludeDataTable] = useState(false)
  const [includeCustomView, setIncludeCustomView] = useState(false)

  const [email, setEmail] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  function buildPayload() {
    const filters: StatisticsFilters = { year, fromMonth, toMonth }

    return {
      filters,
      content: {
        includeKpis,
        includeMonthlyFlow,
        includeDepartmentFluctuation,
        includeChangesByType,
        includeProcessHealth,
        includeDataTable,
        customView:
          includeCustomView && customView
            ? {
                label: customView.label,
                metric: customView.metric,
                dimension: customView.dimension,
                filters: customView.filters,
              }
            : null,
      },
    }
  }

  async function handleDownload() {
    setDownloading(true)
    setResultMessage(null)
    try {
      const res = await fetch("/api/statistiky/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Nepodařilo se vygenerovat PDF.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `statistiky-${year}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setResultMessage({ type: "success", text: "PDF bylo staženo." })
    } catch (err) {
      setResultMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Nepodařilo se vygenerovat PDF.",
      })
    } finally {
      setDownloading(false)
    }
  }

  async function handleSend() {
    if (!email.trim()) return
    setSending(true)
    setResultMessage(null)
    try {
      const res = await fetch("/api/statistiky/pdf/odeslat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPayload(), email: email.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message ?? "Odeslání se nezdařilo.")
      setResultMessage({
        type: "success",
        text: `Odesláno na ${email.trim()}.`,
      })
    } catch (err) {
      setResultMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Odeslání se nezdařilo.",
      })
    } finally {
      setSending(false)
    }
  }

  const busy = downloading || sending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-[#00847C]/40 text-[#00847C] hover:bg-[#00847C]/10"
        >
          <Download className="size-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Export statistik</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Co má PDF obsahovat:</p>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeKpis}
              onCheckedChange={(v) => setIncludeKpis(Boolean(v))}
            />
            Hlavní ukazatele
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeMonthlyFlow}
              onCheckedChange={(v) => setIncludeMonthlyFlow(Boolean(v))}
            />
            Graf: Nástupy a odchody po měsících
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeDepartmentFluctuation}
              onCheckedChange={(v) =>
                setIncludeDepartmentFluctuation(Boolean(v))
              }
            />
            Graf: Fluktuace podle odboru
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeChangesByType}
              onCheckedChange={(v) => setIncludeChangesByType(Boolean(v))}
            />
            Graf: Změny podle typu
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeProcessHealth}
              onCheckedChange={(v) => setIncludeProcessHealth(Boolean(v))}
            />
            Zdraví procesu
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={includeDataTable}
              onCheckedChange={(v) => setIncludeDataTable(Boolean(v))}
            />
            Podkladová tabulka
          </label>
          {customView && (
            <label className="flex items-center gap-2">
              <Checkbox
                checked={includeCustomView}
                onCheckedChange={(v) => setIncludeCustomView(Boolean(v))}
              />
              Aktuální vlastní pohled ({customView.label})
            </label>
          )}
        </div>

        {resultMessage && (
          <div
            className={
              resultMessage.type === "success"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
            }
          >
            {resultMessage.text}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center">
          <Input
            type="email"
            placeholder="E-mail pro odeslání…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
          <div className="flex shrink-0 gap-2">
            <Button
              onClick={() => void handleDownload()}
              disabled={busy}
              className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Stáhnout PDF
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={busy || !email.trim()}
              className="gap-2 bg-[#00847C] text-white hover:bg-[#0B6D73]"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Odeslat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
