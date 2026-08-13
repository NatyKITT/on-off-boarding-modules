"use client"

import * as React from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Mode = "schedule" | "now"

interface MonthlySummaryButtonProps {
  defaultMonth?: string // "YYYY-MM"
  label?: string
  className?: string
  mode?: Mode
  onDone?: () => void
  candidateMonths?: string[]
}

type SentMonth = string

function ymToLabel(ym: string) {
  const parts = ym.split("-")
  const y = Number(parts[0] ?? "0")
  const m = Number(parts[1] ?? "1")
  const d = new Date(Date.UTC(y, m - 1, 1))
  return format(d, "LLLL yyyy", { locale: cs })
}

async function fetchSentMonths(): Promise<SentMonth[]> {
  const res = await fetch("/api/reporty/mesicni/odeslano", {
    cache: "no-store",
  })
  if (!res.ok) return []
  const j = (await res.json()) as { status: string; data?: string[] }
  return Array.isArray(j?.data) ? j.data : []
}

function last12Months(): string[] {
  const now = new Date()
  const list: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    list.push(`${y}-${String(m).padStart(2, "0")}`)
  }
  return list.sort()
}

export function MonthlySummaryButton({
  defaultMonth,
  label = "Zaslat měsíční report",
  className,
  mode = "schedule",
  onDone,
  candidateMonths,
}: MonthlySummaryButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [months, setMonths] = React.useState<string[]>([])
  const [selected, setSelected] = React.useState<string | undefined>(undefined)
  const [resultMessage, setResultMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  async function openWithFetch() {
    setOpen(true)
    setResultMessage(null)
    const sent = await fetchSentMonths()
    const candidates = (
      candidateMonths?.length ? candidateMonths : last12Months()
    ).filter((ym) => !sent.includes(ym))

    setMonths(candidates)
    const prefer =
      defaultMonth && candidates.includes(defaultMonth)
        ? defaultMonth
        : candidates.length
          ? candidates[candidates.length - 1]
          : undefined
    setSelected(prefer)
  }

  async function handleSubmit() {
    if (!selected) {
      setResultMessage({ type: "error", text: "Není vybrán žádný měsíc." })
      return
    }
    const [yStr, mStr] = selected.split("-")
    const year = Number(yStr)
    const month = Number(mStr)

    setResultMessage(null)

    try {
      setBusy(true)
      if (mode === "now") {
        const res = await fetch(
          `/api/reporty/mesicni/odeslat-hned?year=${year}&month=${month}`,
          {
            method: "POST",
          }
        )
        const j = await res.json().catch(() => null)
        if (!res.ok) throw new Error(j?.message ?? "Odeslání se nezdařilo.")
      } else {
        const scheduleAt = new Date(
          Date.UTC(year, month - 1, 3, 14, 0, 0, 0)
        ).toISOString()
        const res = await fetch(`/api/reporty/mesicni/odeslat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, scheduleAt }),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok) throw new Error(j?.message ?? "Naplánování se nezdařilo.")
      }
      onDone?.()
      setResultMessage({
        type: "success",
        text:
          mode === "now"
            ? "Souhrn zařazen k okamžitému odeslání."
            : "Souhrn byl naplánován.",
      })
      setTimeout(() => setOpen(false), 1500)
    } catch (e) {
      setResultMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Akce se nezdařila.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button className={className} onClick={openWithFetch} variant="secondary">
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {mode === "now"
                ? "Odeslat měsíční report"
                : "Naplánovat měsíční report"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Label>Vyber měsíc</Label>
            <Select
              value={selected}
              onValueChange={setSelected}
              disabled={!months.length}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    months.length ? "Zvol měsíc…" : "Žádný dostupný měsíc"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {months.map((ym) => (
                  <SelectItem key={ym} value={ym}>
                    {ymToLabel(ym)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!months.length && (
              <p className="text-sm text-muted-foreground">
                Momentálně není dostupný žádný měsíc, který by ještě nebyl
                odeslán.
              </p>
            )}

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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Zavřít
            </Button>
            <Button onClick={handleSubmit} disabled={busy || !selected}>
              {busy
                ? "Zpracovávám…"
                : mode === "now"
                  ? "Odeslat hned"
                  : "Naplánovat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
