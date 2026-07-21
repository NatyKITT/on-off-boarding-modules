"use client"

import React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeftRight,
  Loader2,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"

import {
  useGlobalSearch,
  type GlobalSearchModule,
} from "@/hooks/use-global-search"

import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const MODULE_ICONS: Record<GlobalSearchModule, typeof UserPlus> = {
  nastup: UserPlus,
  odchod: UserMinus,
  zmena: ArrowLeftRight,
}

const MODULE_LABELS: Record<GlobalSearchModule, string> = {
  nastup: "Nástup",
  odchod: "Odchod",
  zmena: "Změna",
}

const MIN_QUERY_LENGTH = 2

type SelectedResult = {
  module: GlobalSearchModule
  label: string
}

export function SearchCommand() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<SelectedResult | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const { results, loading } = useGlobalSearch(query)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  React.useEffect(() => {
    if (!sp.get("highlight")) {
      setSelected(null)
    }
  }, [sp])

  const runCommand = React.useCallback((command: () => unknown) => {
    setOpen(false)
    setQuery("")
    command()
  }, [])

  const clearSelection = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      setSelected(null)
      router.push(pathname)
    },
    [router, pathname]
  )

  const SelectedIcon = selected ? MODULE_ICONS[selected.module] : null

  return (
    <>
      <div className="flex w-full items-center gap-2 md:w-96 lg:w-[26rem]">
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          className="group flex h-12 min-w-0 flex-1 items-center justify-start gap-4 rounded-full border-input bg-muted/40 px-4 text-left shadow-sm transition-colors hover:bg-muted/70"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#00847C]/10 text-[#00847C] transition-colors group-hover:bg-[#00847C]/15">
            {SelectedIcon ? (
              <SelectedIcon className="size-4" />
            ) : (
              <Search className="size-4" />
            )}
          </span>
          <span className="flex min-w-0 flex-col items-start justify-center gap-0.5 leading-tight">
            {selected ? (
              <span className="truncate text-sm font-medium text-foreground">
                {selected.label}
              </span>
            ) : (
              <>
                <span className="truncate text-sm font-medium text-foreground">
                  Hledat zaměstnance…
                </span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">
                  v nástupech, odchodech i změnách
                </span>
              </>
            )}
          </span>
        </Button>

        {selected && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 shrink-0 rounded-full"
            onClick={clearSelection}
            title="Zrušit výběr"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Hledat podle jména, příjmení, titulu, pozice, odboru…"
        />
        <CommandList onWheel={(event) => event.stopPropagation()}>
          {query.trim().length < MIN_QUERY_LENGTH ? (
            <CommandEmpty>
              Začněte psát jméno, příjmení, titul, pozici nebo odbor…
            </CommandEmpty>
          ) : loading ? (
            <CommandEmpty>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Hledám…
              </span>
            </CommandEmpty>
          ) : results.length === 0 ? (
            <CommandEmpty>Nic nenalezeno.</CommandEmpty>
          ) : (
            <CommandGroup heading="Zaměstnanci">
              {results.map((result) => {
                const Icon = MODULE_ICONS[result.module]

                return (
                  <CommandItem
                    key={`${result.module}-${result.id}`}
                    value={`${result.module}-${result.id}-${result.label}-${result.sublabel}`}
                    onSelect={() => {
                      setSelected({
                        module: result.module,
                        label: result.label,
                      })
                      runCommand(() => router.push(result.href))
                    }}
                  >
                    <Icon className="mr-2 size-5 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{result.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {MODULE_LABELS[result.module]}
                        {result.sublabel ? ` · ${result.sublabel}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
