import * as React from "react"

export function useSessionStorageState<T>(
  key: string | null | undefined,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = React.useState<T>(() => {
    if (!key || typeof window === "undefined") return initialValue

    try {
      const raw = window.sessionStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  React.useEffect(() => {
    if (!key || typeof window === "undefined") return

    try {
      window.sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      return
    }
  }, [key, state])

  return [state, setState]
}
