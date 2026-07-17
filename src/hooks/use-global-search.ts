import * as React from "react"

export type GlobalSearchModule = "nastup" | "odchod" | "zmena"

export type GlobalSearchResult = {
  id: number
  module: GlobalSearchModule
  label: string
  sublabel: string
  href: string
}

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

export function useGlobalSearch(query: string) {
  const [results, setResults] = React.useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()

    const timeout = setTimeout(() => {
      setLoading(true)

      fetch(`/api/hledat?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((res) => res.json().catch(() => null))
        .then((json) => {
          setResults(
            json?.status === "success" && Array.isArray(json.data)
              ? (json.data as GlobalSearchResult[])
              : []
          )
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          console.error("Error searching:", error)
          setResults([])
        })
        .finally(() => {
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [query])

  return { results, loading }
}
