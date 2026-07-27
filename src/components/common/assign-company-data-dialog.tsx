"use client"

import { useEffect, useState } from "react"
import { Loader2, Search, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FoundEmployee = {
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  positionName?: string | null
  department?: string | null
  unitName?: string | null
  userEmail: string | null
  userName: string | null
}

type SearchResultItem = {
  id: string
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  personalNumber: string
  positionName?: string | null
  department?: string | null
  unitName?: string | null
  email: string
  userName?: string | null
}

type AssignedData = {
  userEmail: string | null
  userName: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  personalNumber?: string
  firstName?: string
  lastName?: string
  onAssign: (data: AssignedData) => void | Promise<void>
  saving?: boolean
}

const stripAccents = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

function buildSuggestedUsername(firstName?: string, lastName?: string) {
  const first = (firstName ?? "").trim()
  const last = (lastName ?? "").trim()

  if (!first || !last) return null

  return stripAccents(`${first[0]}${last}`).replace(/[^a-z0-9]/g, "")
}

function displayName(employee: {
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
}) {
  return [
    employee.titleBefore,
    employee.name,
    employee.surname,
    employee.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
}

export function AssignCompanyDataDialog({
  open,
  onOpenChange,
  personalNumber,
  firstName,
  lastName,
  onAssign,
  saving = false,
}: Props) {
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoFound, setAutoFound] = useState<FoundEmployee | null>(null)
  const [autoNotFound, setAutoNotFound] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  const [matchedEmployee, setMatchedEmployee] = useState<FoundEmployee | null>(
    null
  )
  const [outsideProduction, setOutsideProduction] = useState(false)

  const [draftEmail, setDraftEmail] = useState("")
  const [draftUserName, setDraftUserName] = useState("")

  useEffect(() => {
    if (!open) {
      setAutoLoading(false)
      setAutoFound(null)
      setAutoNotFound(false)
      setAutoError(null)
      setQuery("")
      setSearchResults([])
      setSearchError(null)
      setMatchedEmployee(null)
      setOutsideProduction(false)
      setDraftEmail("")
      setDraftUserName("")
      return
    }

    const trimmed = (personalNumber ?? "").trim()

    if (!trimmed) {
      setAutoFound(null)
      setAutoNotFound(false)
      return
    }

    const controller = new AbortController()

    void (async () => {
      try {
        setAutoLoading(true)
        setAutoError(null)
        setAutoNotFound(false)

        const url = new URL(
          "/api/zamestnanci/predvyplnit",
          window.location.origin
        )
        url.searchParams.set("personalNumber", trimmed)

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        })

        if (res.status === 404) {
          setAutoNotFound(true)
          setAutoFound(null)
          return
        }

        if (!res.ok) {
          throw new Error("Vyhledání v EOS se nezdařilo.")
        }

        const json = await res.json().catch(() => null)

        setAutoFound(json?.data ?? null)
        setOutsideProduction(Boolean(json?.outsideProduction))
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setAutoError(
            e instanceof Error ? e.message : "Vyhledání v EOS se nezdařilo."
          )
        }
      } finally {
        setAutoLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, personalNumber])

  useEffect(() => {
    if (!open) return

    if (query.trim().length < 2) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    const controller = new AbortController()

    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true)
        setSearchError(null)

        const url = new URL("/api/zamestnanci/hledat", window.location.origin)
        url.searchParams.set("q", query.trim())
        url.searchParams.set("limit", "20")

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error("Vyhledávání v EOS se nezdařilo.")
        }

        const json = await res.json().catch(() => null)
        setSearchResults(Array.isArray(json?.data) ? json.data : [])
        setOutsideProduction(Boolean(json?.outsideProduction))
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSearchError(
            e instanceof Error ? e.message : "Vyhledávání se nezdařilo."
          )
        }
      } finally {
        setSearchLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [open, query])

  const suggestedUsername = buildSuggestedUsername(firstName, lastName)
  const suggestedEmail = suggestedUsername
    ? `${suggestedUsername}@praha6.cz`
    : null

  function applyEmployeeToDraft(employee: FoundEmployee) {
    setMatchedEmployee(employee)
    setDraftEmail(employee.userEmail ?? "")
    setDraftUserName(employee.userName ?? "")
  }

  useEffect(() => {
    if (autoFound) applyEmployeeToDraft(autoFound)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFound])

  function selectSearchResult(item: SearchResultItem) {
    applyEmployeeToDraft({
      name: item.name,
      surname: item.surname,
      titleBefore: item.titleBefore,
      titleAfter: item.titleAfter,
      positionName: item.positionName,
      department: item.department,
      unitName: item.unitName,
      userEmail: item.email || null,
      userName: item.userName || null,
    })
  }

  function useSuggestion() {
    if (suggestedUsername) setDraftUserName(suggestedUsername)
    if (suggestedEmail) setDraftEmail(suggestedEmail)
  }

  async function handleSave() {
    await onAssign({
      userEmail: draftEmail.trim() || null,
      userName: draftUserName.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Propojit firemní účty</DialogTitle>
          <DialogDescription>
            Vyhledá firemní e-mail a uživatelské jméno v EOS podle osobního
            čísla nebo jména – navržené údaje lze před uložením upravit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {autoLoading && (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Hledám v EOS podle osobního čísla…
            </div>
          )}

          {!autoLoading && autoError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {autoError}
            </div>
          )}

          {!autoLoading && matchedEmployee && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="font-medium">
                Nalezeno v EOS: {displayName(matchedEmployee)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  matchedEmployee.positionName,
                  matchedEmployee.department,
                  matchedEmployee.unitName,
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            </div>
          )}

          {!autoLoading && matchedEmployee && outsideProduction && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              Upozornění: v tomto prostředí se vyhledávání stále dotazuje
              ostrého systému EOS se skutečnými daty. Pokud toto osobní číslo
              patří testovacímu záznamu, může se zobrazit skutečná osoba – před
              uložením prosím ověřte, že jde opravdu o hledaného člověka.
            </div>
          )}

          {!autoLoading && autoNotFound && !matchedEmployee && (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                V EOS zatím nenalezena žádná shoda podle osobního čísla.
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Pokud účet ještě není založený v EOS, kontaktujte IT oddělení
                KITT6. Ruční vyplnění se nedoporučuje, ať údaje odpovídají
                skutečnosti – raději nechte nevyplněné.
              </div>

              {suggestedEmail && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={useSuggestion}
                >
                  Doplnit navrhovaný tvar (jprijmeni)
                </Button>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-company-email">Firemní e-mail</Label>
              <Input
                id="assign-company-email"
                type="email"
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                placeholder="např. jprijmeni@praha6.cz"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-company-username">Uživatelské jméno</Label>
              <Input
                id="assign-company-username"
                value={draftUserName}
                onChange={(e) => setDraftUserName(e.target.value)}
                className="font-mono"
                placeholder="např. jprijmeni"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Vyhledat ručně – jméno, příjmení nebo osobní číslo…"
                className="pl-9"
              />
            </div>

            {searchLoading && (
              <div className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
                Načítám výsledky…
              </div>
            )}

            {!searchLoading && searchError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {searchError}
              </div>
            )}

            {!searchLoading &&
              !searchError &&
              query.trim().length >= 2 &&
              searchResults.length === 0 && (
                <div className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
                  Nic nenalezeno.
                </div>
              )}

            {!searchLoading && searchResults.length > 0 && (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectSearchResult(item)}
                    className="block w-full rounded-md border p-2.5 text-left text-sm transition hover:bg-muted"
                  >
                    <div className="flex items-start gap-2">
                      <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{displayName(item)}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.personalNumber}
                          {item.positionName ? ` • ${item.positionName}` : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Zavřít
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Použít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
