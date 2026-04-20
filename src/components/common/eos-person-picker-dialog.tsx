import { useEffect, useState } from "react"
import { Search, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { EmployeeItem } from "@/components/common/employee-combobox"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onSelect: (employee: EmployeeItem) => void
}

export function EosPersonPickerDialog({
  open,
  onOpenChange,
  title,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<EmployeeItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setItems([])
      setError(null)
      return
    }

    if (query.trim().length < 2) {
      setItems([])
      setError(null)
      return
    }

    const controller = new AbortController()

    const timeout = setTimeout(async () => {
      try {
        setLoading(true)
        setError(null)

        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", query.trim())
        url.searchParams.set("limit", "20")

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error("Nepodařilo se načíst zaměstnance z EOS.")
        }

        const json = await res.json().catch(() => null)
        setItems(Array.isArray(json?.data) ? json.data : [])
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(
            e instanceof Error ? e.message : "Nepodařilo se načíst výsledky."
          )
        }
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [open, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Vyhledejte zaměstnance podle osobního čísla, jména nebo příjmení.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Např. Novák, 0123, Jana..."
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {loading && (
              <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                Načítám výsledky…
              </div>
            )}

            {!loading && error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && query.trim().length < 2 && (
              <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                Začněte psát alespoň 2 znaky.
              </div>
            )}

            {!loading &&
              !error &&
              query.trim().length >= 2 &&
              items.length === 0 && (
                <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                  Nic nenalezeno.
                </div>
              )}

            {!loading &&
              !error &&
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item)
                    onOpenChange(false)
                  }}
                  className="block w-full rounded-md border p-3 text-left transition hover:bg-muted"
                >
                  <div className="flex items-start gap-3">
                    <User className="mt-0.5 size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        [ item.titleBefore, item.name, item.surname,
                        item.titleAfter, ] .filter(Boolean) .join(&#34; &#34;)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.personalNumber}
                        {item.positionName ? ` • ${item.positionName}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[item.department, item.unitName]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                      {item.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {item.email}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zavřít
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
