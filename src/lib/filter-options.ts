import type { MultiSelectOption } from "@/components/common/multi-select-filter"

export const FILTER_EMPTY_VALUE = "__none__"

export function buildDistinctOptions(
  values: Array<string | null | undefined>
): MultiSelectOption[] {
  const set = new Set<string>()

  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) set.add(trimmed)
  }

  return Array.from(set)
    .sort((a, b) => a.localeCompare(b, "cs"))
    .map((value) => ({ value, label: value }))
}

export function buildOptionsWithEmpty(
  values: Array<string | null | undefined>,
  emptyLabel: string
): MultiSelectOption[] {
  const options = buildDistinctOptions(values)
  const hasMissing = values.some((value) => !value?.trim())

  return hasMissing
    ? [{ value: FILTER_EMPTY_VALUE, label: emptyLabel }, ...options]
    : options
}

/**
 * Keeps only the options whose value is still reachable given the other
 * active facets (see useFacetedFilter's `availableValues`) — this is what
 * makes a filter's dropdown narrow itself instead of offering choices that
 * would produce zero results.
 */
export function filterAvailableOptions(
  options: MultiSelectOption[],
  available: Set<string>
): MultiSelectOption[] {
  return options.filter((option) => available.has(option.value))
}
