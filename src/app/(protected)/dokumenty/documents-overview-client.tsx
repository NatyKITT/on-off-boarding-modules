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
import { useSessionStorageState } from "@/hooks/use-session-storage-state"
import { useTextFilter } from "@/hooks/use-text-filter"
import {
  buildDistinctOptions,
  filterAvailableOptions,
} from "@/lib/filter-options"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ActiveFilterChips } from "@/components/common/active-filter-chips"
import { ListPageSkeleton } from "@/components/common/list-page-skeleton"
import { MultiSelectFilter } from "@/components/common/multi-select-filter"
import { SearchInput } from "@/components/common/search-input"

import { DocumentRow, PersonBulkActions } from "./document-row"
import type { PersonRow } from "./types"

type FacetKey = "kind" | "department" | "recordStatus" | "rowStatus"

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

function relevantDate(row: PersonRow) {
  return row.actualDate ?? row.plannedDate
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
    <Card className={status === "cancelled" ? "opacity-60" : undefined}>
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
  kind,
  rows,
  isFiltering,
}: {
  kind: PersonRow["kind"]
  rows: PersonRow[]
  isFiltering: boolean
}) {
  const storageKey = `dokumenty-expanded-${kind}`
  const currentYear = String(new Date().getFullYear())

  const [expandedYears, setExpandedYears] = useSessionStorageState<string[]>(
    storageKey + "-years",
    [currentYear]
  )
  const [expandedMonths, setExpandedMonths] = useSessionStorageState<string[]>(
    storageKey + "-months",
    []
  )

  const grouped = useMemo(() => groupByYearMonth(rows), [rows])
  const years = useMemo(
    () => Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a)),
    [grouped]
  )
  const allMonths = useMemo(
    () => years.flatMap((year) => Array.from(grouped.get(year)!.keys())),
    [years, grouped]
  )

  if (rows.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {kind === "onboarding" ? (
          <UserPlus className="size-5 text-primary" />
        ) : (
          <UserMinus className="size-5 text-primary" />
        )}
        <h2 className="text-lg font-semibold">
          {kind === "onboarding" ? "Nástupy" : "Odchody"}
        </h2>
        <Badge variant="secondary">{rows.length}</Badge>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => {
              setExpandedYears(years)
              setExpandedMonths(allMonths)
            }}
          >
            <ChevronsDown className="size-3.5" />
            Rozbalit vše
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => {
              setExpandedYears([])
              setExpandedMonths([])
            }}
          >
            <ChevronsUp className="size-3.5" />
            Sbalit vše
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {years.map((year) => {
          const months = grouped.get(year)!
          const isYearExpanded = isFiltering || expandedYears.includes(year)
          const yearTotal = Array.from(months.values()).reduce(
            (sum, list) => sum + list.length,
            0
          )

          return (
            <Collapsible key={year} open={isYearExpanded}>
              <CollapsibleTrigger
                onClick={() =>
                  setExpandedYears((prev) =>
                    prev.includes(year)
                      ? prev.filter((y) => y !== year)
                      : [...prev, year]
                  )
                }
                className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-muted/50 p-3 transition-colors hover:bg-muted"
              >
                {isYearExpanded ? (
                  <ChevronDown className="size-5" />
                ) : (
                  <ChevronRight className="size-5" />
                )}
                <span className="text-lg font-semibold">{year}</span>
                <Badge variant="secondary" className="ml-auto">
                  {yearTotal}
                </Badge>
              </CollapsibleTrigger>

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
  } = useTextFilter<PersonRow>(
    (row) => [row.fullName, row.personalNumber, row.department, row.unitName],
    { persistKey: "dokumenty-search" }
  )

  const searchedRows = useMemo(() => filterRows(rows), [filterRows, rows])

  const {
    filters: facetFilters,
    setFacetValues: setFacetFilter,
    clearAll: clearAllFacets,
    filteredRows,
    availableValues,
  } = useFacetedFilter<PersonRow, FacetKey>(
    searchedRows,
    {
      kind: (row) => [KIND_LABEL[row.kind]],
      department: (row) => [row.department],
      recordStatus: (row) => [recordStatus(row)],
      rowStatus: (row) => [rowStatus(row)],
    },
    { persistKey: "dokumenty-facets" }
  )

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
            <div className="space-y-6">
              <KindSection
                kind="onboarding"
                rows={onboardingRows}
                isFiltering={isFiltering}
              />
              <KindSection
                kind="offboarding"
                rows={offboardingRows}
                isFiltering={isFiltering}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
