import * as React from "react"

const AUTO_DISMISS_MS = 4000

/**
 * Clears a "highlighted record" state on its own after a few seconds, or
 * immediately if the user clicks anywhere on the page — so a highlight from
 * the global search doesn't linger forever.
 */
export function useDismissableHighlight(
  highlightedId: number | null,
  clear: () => void
) {
  React.useEffect(() => {
    if (highlightedId === null) return

    const timeout = setTimeout(clear, AUTO_DISMISS_MS)
    const handleClick = () => clear()

    document.addEventListener("click", handleClick)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener("click", handleClick)
    }
  }, [highlightedId, clear])
}
