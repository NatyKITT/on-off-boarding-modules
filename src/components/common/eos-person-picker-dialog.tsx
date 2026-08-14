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
  excludeActiveOffboardings?: boolean
}

const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g")

function normalize(value: string) {
  return value.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase()
}

export function EosPersonPickerDialog({
  open,
  onOpenChange,
  title,
  onSelect,
  excludeActiveOffboardings = true,
}: Props) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [allEmployees, setAllEmployees] = useState<EmployeeItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setAllEmployees([])
      setError(null)
      return
    }

    const controller = new AbortController()

    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", "1")
        url.searchParams.set("limit", "1000")
        if (!excludeActiveOffboardings) {
          url.searchParams.set("excludeActiveOffboardings", "false")
        }

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error("Nepodařilo se načíst zaměstnance z EOS.")
        }

        const json = await res.json().catch(() => null)
        setAllEmployees(Array.isArray(json?.data) ? json.data : [])
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(
            e instanceof Error ? e.message : "Nepodařilo se načíst výsledky."
          )
        }
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, excludeActiveOffboardings])

  const q = normalize(query.trim())
  const items = q
    ? allEmployees.filter((item) => {
        const num = normalize(item.personalNumber)
        const name = normalize(
          `${item.titleBefore ?? ""} ${item.name} ${item.surname} ${item.titleAfter ?? ""}`
        )
        const org = normalize(
          `${item.positionName} ${item.department} ${item.unitName}`
        )
        const email = normalize(item.email ?? "")
        return (
          num.includes(q) ||
          name.includes(q) ||
          org.includes(q) ||
          email.includes(q)
        )
      })
    : allEmployees

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Vyhledejte zaměstnance podle osobního čísla, jména, příjmení nebo
            e-mailu, případně procházejte celý seznam.
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
              autoFocus
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {loading && (
              <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                Načítám zaměstnance z EOS…
              </div>
            )}

            {!loading && error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
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
                        {[
                          item.titleBefore,
                          item.name,
                          item.surname,
                          item.titleAfter,
                        ]
                          .filter(Boolean)
                          .join(" ")}
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
