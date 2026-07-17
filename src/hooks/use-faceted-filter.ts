import * as React from "react"

export type FacetValueGetter<T> = (row: T) => Array<string | null | undefined>

function normalizeValues(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>()

  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) set.add(trimmed)
  }

  return Array.from(set)
}

/**
 * Generic faceted-filter engine shared by list pages (Nástupy/Odchody/Změny).
 *
 * Rules it enforces, regardless of what the caller's facets represent:
 * - Within one facet, selected values combine with OR (any match passes).
 * - Between facets, the result must satisfy every facet with an active
 *   selection at once (AND).
 * - `availableValues[key]` reports, for each facet, only the values that are
 *   still reachable given every OTHER active facet — so a page can hide/gray
 *   out options that would otherwise produce zero results.
 *
 * `rows` should already reflect any pre-filtering that isn't itself a facet
 * with a discrete option list (free-text search, a single date picker, …) —
 * doing so keeps those constraints part of the same AND chain and the same
 * availableValues narrowing, without the engine needing to know about them.
 */
export function useFacetedFilter<T, K extends string>(
  rows: T[],
  facets: Record<K, FacetValueGetter<T>>
) {
  const facetKeys = Object.keys(facets) as K[]
  const facetKeysSignature = facetKeys.join("|")

  const emptyFilters = React.useMemo(
    () =>
      Object.fromEntries(facetKeys.map((key) => [key, [] as string[]])) as Record<
        K,
        string[]
      >,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facetKeysSignature]
  )

  const [filters, setFilters] = React.useState<Record<K, string[]>>(emptyFilters)

  const setFacetValues = React.useCallback((key: K, values: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: values }))
  }, [])

  const clearAll = React.useCallback(() => {
    setFilters(emptyFilters)
  }, [emptyFilters])

  const rowMatchesFacet = React.useCallback(
    (row: T, key: K) => {
      const selected = filters[key]
      if (!selected || selected.length === 0) return true

      const candidates = normalizeValues(facets[key](row))
      return selected.some((value) => candidates.includes(value))
    },
    [facets, filters]
  )

  const matchesAllFacets = React.useCallback(
    (row: T, excludeKey?: K) =>
      facetKeys.every((key) => key === excludeKey || rowMatchesFacet(row, key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facetKeysSignature, rowMatchesFacet]
  )

  const filteredRows = React.useMemo(
    () => rows.filter((row) => matchesAllFacets(row)),
    [rows, matchesAllFacets]
  )

  const availableValues = React.useMemo(() => {
    const result = {} as Record<K, Set<string>>

    for (const key of facetKeys) {
      const set = new Set<string>()

      for (const row of rows) {
        if (!matchesAllFacets(row, key)) continue

        for (const value of normalizeValues(facets[key](row))) {
          set.add(value)
        }
      }

      result[key] = set
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, facetKeysSignature, facets, matchesAllFacets])

  return { filters, setFacetValues, clearAll, filteredRows, availableValues }
}
