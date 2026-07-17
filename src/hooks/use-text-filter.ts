import * as React from "react"

export function useTextFilter<T>(
  getSearchableText: (row: T) => Array<string | null | undefined>
) {
  const [query, setQuery] = React.useState("")

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
