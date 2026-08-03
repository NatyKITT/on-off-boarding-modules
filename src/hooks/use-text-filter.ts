import * as React from "react"

import { useSessionStorageState } from "@/hooks/use-session-storage-state"

export function useTextFilter<T>(
  getSearchableText: (row: T) => Array<string | null | undefined>,
  options?: { persistKey?: string }
) {
  const [query, setQuery] = useSessionStorageState(options?.persistKey, "")

  const filterRows = React.useCallback(
    (rows: T[]) => {
      const needle = query.trim().toLowerCase()

      if (!needle) return rows

      return rows.filter((row) =>
        getSearchableText(row)
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    },
    [query, getSearchableText]
  )

  return { query, setQuery, filterRows }
}
