"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useUnsavedChangesGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const guardAction = useCallback((action: () => void) => {
    if (dirtyRef.current) {
      setPendingAction(() => action)
    } else {
      action()
    }
  }, [])

  const allowProgrammaticPopRef = useRef(false)

  useEffect(() => {
    if (!dirty) return

    window.history.pushState(
      { unsavedChangesGuard: true },
      "",
      window.location.href
    )

    function handlePopState() {
      if (allowProgrammaticPopRef.current) {
        allowProgrammaticPopRef.current = false
        return
      }

      if (!dirtyRef.current) return

      window.history.pushState(
        { unsavedChangesGuard: true },
        "",
        window.location.href
      )

      guardAction(() => {
        allowProgrammaticPopRef.current = true
        window.history.go(-2)
      })
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [dirty, guardAction])

  const closeDialog = useCallback(() => setPendingAction(null), [])

  const proceed = useCallback(() => {
    const action = pendingAction
    setPendingAction(null)
    action?.()
  }, [pendingAction])

  return {
    isDialogOpen: pendingAction !== null,
    guardAction,
    closeDialog,
    proceed,
  }
}
