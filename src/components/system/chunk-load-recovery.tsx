"use client"

import * as React from "react"

const STORAGE_KEY = "onboarding:chunk-load-recovery:last-reload"
const RELOAD_COOLDOWN_MS = 60_000

function getErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message

  if (typeof value === "string") return value

  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "")
  }

  return ""
}

function isChunkLoadError(value: unknown): boolean {
  const message = getErrorMessage(value)

  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  )
}

function canReloadNow(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(STORAGE_KEY) ?? "0")
    return Date.now() - lastReload > RELOAD_COOLDOWN_MS
  } catch {
    return true
  }
}

function markReloadAttempt() {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()))
  } catch {}
}

export function ChunkLoadRecovery() {
  React.useEffect(() => {
    function reloadOnce() {
      if (!canReloadNow()) return

      markReloadAttempt()
      window.location.reload()
    }

    function handleError(event: ErrorEvent) {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        reloadOnce()
      }
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) {
        reloadOnce()
      }
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    }
  }, [])

  return null
}
