"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react"

import { useFacetedFilter } from "@/hooks/use-faceted-filter"
import { useTextFilter } from "@/hooks/use-text-filter"
import {
  buildDistinctOptions,
  filterAvailableOptions,
} from "@/lib/filter-options"
import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActiveFilterChips } from "@/components/common/active-filter-chips"
import { ListPageSkeleton } from "@/components/common/list-page-skeleton"
import { MultiSelectFilter } from "@/components/common/multi-select-filter"
import { SearchInput } from "@/components/common/search-input"

import { DocumentRow, PersonBulkActions } from "./document-row"
import type { PersonRow } from "./types"

type FacetKey =
  | "kind"
  | "department"
  | "recordStatus"
  | "rowStatus"
  | "sendStatus"

const KIND_LABEL: Record<PersonRow["kind"], string> = {
  onboarding: "Nástup",
  offboarding: "Odchod",
}

const RECORD_STATUS_OPTIONS = [
  { value: "planned", label: "Plánovaný" },
  { value: "actual", label: "Skutečný" },
  { value: "cancelled", label: "Zrušený" },
]

const ROW_STATUS_OPTIONS = [
  { value: "complete", label: "Vyplněno vše" },
  { value: "partial", label: "Rozpracováno" },
  { value: "missing", label: "Nevyplněno" },
]

const SEND_STATUS_OPTIONS = [
  { value: "not_created", label: "Nevytvořeno" },
  { value: "not_sent", label: "Neodesláno" },
  { value: "sent_pending", label: "Odesláno, nevyplněno" },
  { value: "completed", label: "Vyplněno" },
]

function recordStatus(row: PersonRow): "planned" | "actual" | "cancelled" {
  if (row.cancelledAt) return "cancelled"
  return row.actualDate ? "actual" : "planned"
}

function rowStatus(row: PersonRow): "complete" | "partial" | "missing" {
  const completedCount = row.documents.filter(
    (doc) => doc.status === "completed"
  ).length

  if (completedCount === row.documents.length) return "complete"
  if (completedCount === 0) return "missing"
  return "partial"
}

function documentSendStatus(
  doc: PersonRow["documents"][number]
): "not_created" | "not_sent" | "sent_pending" | "completed" {
  if (doc.status === "not_created") return "not_created"
  if (doc.status === "completed") return "completed"
  if (doc.note === "Zatím neodesláno") return "not_sent"
  return "sent_pending"
}

function relevantDate(row: PersonRow) {
  return row.actualDate ?? row.plannedDate
}

function personCardTint(
  kind: PersonRow["kind"],
  status: "planned" | "actual" | "cancelled"
) {
  if (status === "cancelled") return "bg-muted/40"

  if (kind === "onboarding") {
    return status === "actual"
      ? "bg-green-50/70 dark:bg-green-950/20"
      : "bg-blue-50/70 dark:bg-blue-950/20"
  }

  return status === "actual"
    ? "bg-red-50/70 dark:bg-red-950/20"
    : "bg-orange-50/70 dark:bg-orange-950/20"
}

function groupByYearMonth(rows: PersonRow[]) {
  const years = new Map<string, Map<string, PersonRow[]>>()

  for (const row of rows) {
    const date = relevantDate(row)
    const year = date.slice(0, 4)
    const month = date.slice(0, 7)

    if (!years.has(year)) years.set(year, new Map())
    const months = years.get(year)!

    if (!months.has(month)) months.set(month, [])
    months.get(month)!.push(row)
  }

  return years
}

function PersonRowCard({
  row,
  forceExpanded,
}: {
  row: PersonRow
  forceExpanded: boolean
}) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const expanded = forceExpanded || localExpanded
  const status = recordStatus(row)
  const completedCount = row.documents.filter(
    (doc) => doc.status === "completed"
  ).length

  return (
    <Card
      className={cn(
        personCardTint(row.kind, status),
        status === "cancelled" && "opacity-60"
      )}
    >
      <CardContent className="p-0">
        <Collapsible open={expanded}>
          <CollapsibleTrigger
            onClick={() => setLocalExpanded((prev) => !prev)}
            className="flex w-full min-w-0 items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50"
          >
            {expanded ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{row.fullName}</span>
                {status === "cancelled" && (
                  <XCircle className="size-3.5 shrink-0 text-gray-500" />
                )}
                <Badge
                  variant={status === "cancelled" ? "outline" : "secondary"}
                  className="shrink-0"
                >
                  {RECORD_STATUS_OPTIONS.find((o) => o.value === status)?.label}
                </Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[row.department, row.unitName].filter(Boolean).join(" – ")}
                {row.personalNumber ? ` · ${row.personalNumber}` : ""}
              </div>
            </div>

            <Badge variant="outline" className="shrink-0">
              {completedCount}/{row.documents.length} vyplněno
            </Badge>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-1.5 border-t p-3">
            <PersonBulkActions
              documents={row.documents}
              personLabel={row.fullName}
            />
            {row.documents.map((doc) => (
              <DocumentRow key={doc.key} doc={doc} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function KindSection({
  rows,
  isFiltering,
}: {
  rows: PersonRow[]
  isFiltering: boolean
}) {
  const currentYear = String(new Date().getFullYear())

  const [expandedYears, setExpandedYears] = useState<string[]>([currentYear])
  const [expandedMonths, setExpandedMonths] = useState<string[]>([])

  const grouped = useMemo(() => groupByYearMonth(rows), [rows])
  const years = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a)),
    [grouped]
  )
  const allMonths = useMemo(
    () => years.flatMap((year) => Array.from(grouped.get(year)!.keys())),
    [years, grouped]
  )

  const allExpanded =
    years.length > 0 &&
    years.every((year) => expandedYears.includes(year)) &&
    allMonths.every((month) => expandedMonths.includes(month))

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {isFiltering
          ? "Žádné záznamy tady neodpovídají zadaným filtrům."
          : "Žádné záznamy."}
      </p>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "záznam" : "záznamů"}
        </span>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 text-xs text-muted-foreground"
          onClick={() => {
            if (allExpanded) {
              setExpandedYears([])
              setExpandedMonths([])
            } else {
              setExpandedYears(years)
              setExpandedMonths(allMonths)
            }
          }}
        >
          {allExpanded ? (
            <ChevronsUp className="size-3.5" />
          ) : (
            <ChevronsDown className="size-3.5" />
          )}
          {allExpanded ? "Sbalit vše" : "Rozbalit vše"}
        </Button>
      </div>

      <div className="space-y-2">
        {years.map((year) => {
          const months = grouped.get(year)!
          const isYearExpanded = isFiltering || expandedYears.includes(year)
          const yearTotal = Array.from(months.values()).reduce(
            (sum, list) => sum + list.length,
            0
          )
          const yearMonths = Array.from(months.keys())
          const allYearMonthsExpanded =
            yearMonths.length > 0 &&
            yearMonths.every((month) => expandedMonths.includes(month))

          return (
            <Collapsible key={year} open={isYearExpanded}>
              <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted">
                <CollapsibleTrigger
                  onClick={() =>
                    setExpandedYears((prev) =>
                      prev.includes(year)
                        ? prev.filter((y) => y !== year)
                        : [...prev, year]
                    )
                  }
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {isYearExpanded ? (
                    <ChevronDown className="size-5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0" />
                  )}
                  <span className="text-lg font-semibold">{year}</span>
                  <Badge variant="secondary">{yearTotal}</Badge>
                </CollapsibleTrigger>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 text-xs text-muted-foreground"
                  onClick={() => {
                    if (allYearMonthsExpanded) {
                      setExpandedMonths((prev) =>
                        prev.filter((month) => !yearMonths.includes(month))
                      )
                    } else {
                      setExpandedMonths((prev) =>
                        Array.from(new Set([...prev, ...yearMonths]))
                      )
                      setExpandedYears((prev) =>
                        prev.includes(year) ? prev : [...prev, year]
                      )
                    }
                  }}
                >
                  {allYearMonthsExpanded ? (
                    <ChevronsUp className="size-3.5" />
                  ) : (
                    <ChevronsDown className="size-3.5" />
                  )}
                  {allYearMonthsExpanded ? "Sbalit měsíce" : "Rozbalit měsíce"}
                </Button>
              </div>

              <CollapsibleContent className="mt-2 space-y-3">
                {Array.from(months.keys())
                  .sort((a, b) => b.localeCompare(a))
                  .map((month) => {
                    const monthRows = months.get(month)!
                    const isMonthExpanded =
                      isFiltering || expandedMonths.includes(month)

                    return (
                      <Collapsible key={month} open={isMonthExpanded}>
                        <CollapsibleTrigger
                          onClick={() =>
                            setExpandedMonths((prev) =>
                              prev.includes(month)
                                ? prev.filter((m) => m !== month)
                                : [...prev, month]
                            )
                          }
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-blue-50 p-2 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
                        >
                          {isMonthExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          <CalendarDays className="size-4 text-blue-600" />
                          <span className="font-medium">
                            {format(new Date(month + "-01"), "LLLL yyyy", {
                              locale: cs,
                            })}
                          </span>
                          <Badge variant="outline" className="ml-auto">
                            {monthRows.length}
                          </Badge>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="mt-2 space-y-2">
                          {monthRows.map((row) => (
                            <PersonRowCard
                              key={`${row.kind}-${row.id}`}
                              row={row}
                              forceExpanded={isFiltering}
                            />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </section>
  )
}

export function DocumentsOverviewClient() {
  const [rows, setRows] = useState<PersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch("/api/dokumenty/prehled", {
          cache: "no-store",
        })

        if (!res.ok) {
          throw new Error("Nepodařilo se načíst přehled dokumentů.")
        }

        const json = (await res.json()) as { rows: PersonRow[] }
        setRows(json.rows ?? [])
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Nepodařilo se načíst přehled dokumentů."
        )
      } finally {
        setLoading(false)
        setHasLoadedOnce(true)
      }
    })()
  }, [])

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    filterRows,
  } = useTextFilter<PersonRow>((row) => [
    row.fullName,
    row.personalNumber,
    row.department,
    row.unitName,
  ])

  const searchedRows = useMemo(() => filterRows(rows), [filterRows, rows])

  const {
    filters: facetFilters,
    setFacetValues: setFacetFilter,
    clearAll: clearAllFacets,
    filteredRows,
    availableValues,
  } = useFacetedFilter<PersonRow, FacetKey>(searchedRows, {
    kind: (row) => [KIND_LABEL[row.kind]],
    department: (row) => [row.department],
    recordStatus: (row) => [recordStatus(row)],
    rowStatus: (row) => [rowStatus(row)],
    sendStatus: (row) => row.documents.map((doc) => documentSendStatus(doc)),
  })

  const kindOptions = useMemo(
    () => [
      { value: "Nástup", label: "Nástup" },
      { value: "Odchod", label: "Odchod" },
    ],
    []
  )

  const departmentOptionsAll = useMemo(
    () => buildDistinctOptions(rows.map((row) => row.department)),
    [rows]
  )

  const departmentOptions = useMemo(
    () =>
      filterAvailableOptions(departmentOptionsAll, availableValues.department),
    [departmentOptionsAll, availableValues.department]
  )

  const onboardingRows = useMemo(
    () => filteredRows.filter((row) => row.kind === "onboarding"),
    [filteredRows]
  )
  const offboardingRows = useMemo(
    () => filteredRows.filter((row) => row.kind === "offboarding"),
    [filteredRows]
  )

  const isFiltering =
    searchQuery.trim().length > 0 ||
    Object.values(facetFilters).some((values) => values.length > 0)

  const [activeKind, setActiveKind] = useState<"onboarding" | "offboarding">(
    "onboarding"
  )

  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden px-3 pb-8 sm:px-4 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight">Dokumenty</h1>
        <p className="text-muted-foreground">
          Přehled stavu vyplnění nástupních dokumentů, hodnocení zkušební doby a
          výstupních listů napříč všemi záznamy.
        </p>
      </div>

      {!hasLoadedOnce ? (
        <ListPageSkeleton />
      ) : error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Hledat podle jména, osobního čísla, odboru…"
              />

              <MultiSelectFilter
                label="Typ"
                options={kindOptions}
                selected={facetFilters.kind}
                onChange={(values) => setFacetFilter("kind", values)}
                searchPlaceholder="Hledat typ…"
                emptyText="Nic nenalezeno."
              />
              <MultiSelectFilter
                label="Odbor"
                options={departmentOptions}
                selected={facetFilters.department}
                onChange={(values) => setFacetFilter("department", values)}
                searchPlaceholder="Hledat odbor…"
                emptyText="Žádný odbor nenalezen."
              />
              <MultiSelectFilter
                label="Stav záznamu"
                options={RECORD_STATUS_OPTIONS}
                selected={facetFilters.recordStatus}
                onChange={(values) => setFacetFilter("recordStatus", values)}
                searchPlaceholder="Hledat stav…"
                emptyText="Nic nenalezeno."
              />
              <MultiSelectFilter
                label="Stav dokumentů"
                options={ROW_STATUS_OPTIONS}
                selected={facetFilters.rowStatus}
                onChange={(values) => setFacetFilter("rowStatus", values)}
                searchPlaceholder="Hledat stav…"
                emptyText="Nic nenalezeno."
              />
              <MultiSelectFilter
                label="Stav odeslání"
                options={SEND_STATUS_OPTIONS}
                selected={facetFilters.sendStatus}
                onChange={(values) => setFacetFilter("sendStatus", values)}
                searchPlaceholder="Hledat stav…"
                emptyText="Nic nenalezeno."
              />
            </div>

            <ActiveFilterChips
              groups={[
                {
                  key: "kind",
                  label: "Typ",
                  values: facetFilters.kind.map((value) => ({
                    value,
                    label: value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "kind",
                      facetFilters.kind.filter((v) => v !== value)
                    ),
                },
                {
                  key: "department",
                  label: "Odbor",
                  values: facetFilters.department.map((value) => ({
                    value,
                    label: value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "department",
                      facetFilters.department.filter((v) => v !== value)
                    ),
                },
                {
                  key: "recordStatus",
                  label: "Stav záznamu",
                  values: facetFilters.recordStatus.map((value) => ({
                    value,
                    label:
                      RECORD_STATUS_OPTIONS.find((o) => o.value === value)
                        ?.label ?? value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "recordStatus",
                      facetFilters.recordStatus.filter((v) => v !== value)
                    ),
                },
                {
                  key: "rowStatus",
                  label: "Stav dokumentů",
                  values: facetFilters.rowStatus.map((value) => ({
                    value,
                    label:
                      ROW_STATUS_OPTIONS.find((o) => o.value === value)
                        ?.label ?? value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "rowStatus",
                      facetFilters.rowStatus.filter((v) => v !== value)
                    ),
                },
                {
                  key: "sendStatus",
                  label: "Stav odeslání",
                  values: facetFilters.sendStatus.map((value) => ({
                    value,
                    label:
                      SEND_STATUS_OPTIONS.find((o) => o.value === value)
                        ?.label ?? value,
                  })),
                  onRemove: (value) =>
                    setFacetFilter(
                      "sendStatus",
                      facetFilters.sendStatus.filter((v) => v !== value)
                    ),
                },
              ]}
              onClearAll={clearAllFacets}
            />
          </div>

          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné záznamy neodpovídají zadaným filtrům.
            </p>
          ) : (
            <Tabs
              value={activeKind}
              onValueChange={(value) =>
                setActiveKind(value as "onboarding" | "offboarding")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="onboarding"
                  className="flex items-center gap-2"
                >
                  <UserPlus className="size-4" />
                  Nástupy
                  <Badge variant="secondary">{onboardingRows.length}</Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="offboarding"
                  className="flex items-center gap-2"
                >
                  <UserMinus className="size-4" />
                  Odchody
                  <Badge variant="secondary">{offboardingRows.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="onboarding" className="mt-4">
                <KindSection rows={onboardingRows} isFiltering={isFiltering} />
              </TabsContent>

              <TabsContent value="offboarding" className="mt-4">
                <KindSection rows={offboardingRows} isFiltering={isFiltering} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  )
}
