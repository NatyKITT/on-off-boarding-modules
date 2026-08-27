"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const WINDOW_SIZE = 50
const SCROLL_THRESHOLD_PX = 150

export function useIncrementalReveal<T>(items: T[], resetKey: string) {
  const [visibleCount, setVisibleCount] = useState(WINDOW_SIZE)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setVisibleCount(WINDOW_SIZE)
  }, [resetKey])

  const hasMore = visibleCount < items.length

  const checkScroll = useCallback(() => {
    const node = listRef.current
    if (!node) return

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight

    if (distanceFromBottom < SCROLL_THRESHOLD_PX) {
      setVisibleCount((prev) =>
        prev < items.length ? prev + WINDOW_SIZE : prev
      )
    }
  }, [items.length])

  useEffect(() => {
    checkScroll()
  }, [resetKey, checkScroll])

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore,
    listRef,
    onScroll: checkScroll,
  }
}
