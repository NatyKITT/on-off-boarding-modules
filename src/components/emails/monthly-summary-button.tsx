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
  mode?: Mode // "schedule" = naplánovat, "now" = odeslat hned
  onDone?: () => void
  candidateMonths?: string[] // pokud chceš omezit nabídku měsíců
}

type SentMonth = string // "YYYY-MM"

function ymToLabel(ym: string) {
  const parts = ym.split("-")
  const y = Number(parts[0] ?? "0")
  const m = Number(parts[1] ?? "1")
  // zde už jsou y i m vždy čísla
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

  async function openWithFetch() {
    setOpen(true)
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
      alert("Není vybrán žádný měsíc.")
      return
    }
    const [yStr, mStr] = selected.split("-")
    const year = Number(yStr)
    const month = Number(mStr)

    const confirmText =
      mode === "now"
        ? `Opravdu odeslat souhrn za ${ymToLabel(selected)} hned?`
        : `Opravdu naplánovat odeslání souhrnu za ${ymToLabel(selected)} na 3. den v 14:00?`
    if (!window.confirm(confirmText)) return

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
      setOpen(false)
      alert(
        mode === "now"
          ? "Souhrn zařazen k okamžitému odeslání."
          : "Souhrn byl naplánován."
      )
    } catch (e) {
      alert(e instanceof Error ? e.message : "Akce se nezdařila.")
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
        <DialogContent>
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
