import * as React from "react"

const AUTO_DISMISS_MS = 6000

/**
 * Clears a "highlighted record" state on its own after a while, so a
 * highlight from the global search doesn't linger forever if left alone.
 * Does NOT clear on click elsewhere - opening the highlighted record's own
 * documents/detail must not immediately kill the highlight. The caller is
 * responsible for clearing it on more specific actions (e.g. collapsing the
 * month that contains the highlighted row, or navigating to another page).
 */
export function useDismissableHighlight(
  highlightedId: number | null,
  clear: () => void
) {
  React.useEffect(() => {
    if (highlightedId === null) return

    const timeout = setTimeout(clear, AUTO_DISMISS_MS)

    return () => {
      clearTimeout(timeout)
    }
  }, [highlightedId, clear])
}
