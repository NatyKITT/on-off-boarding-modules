import * as React from "react"

export function useSessionStorageState<T>(
  key: string | null | undefined,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState<T>(initialValue)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    if (!key || typeof window === "undefined") return

    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw !== null) setState(JSON.parse(raw) as T)
    } catch {
      // ignore malformed/inaccessible storage
    }

    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  React.useEffect(() => {
    if (!key || !hydrated || typeof window === "undefined") return

    try {
      window.sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      return
    }
  }, [key, state, hydrated])

  return [state, setState]
}
