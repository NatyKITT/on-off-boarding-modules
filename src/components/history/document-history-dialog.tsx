"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { Calendar, History as HistoryIcon, User } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export type DocumentHistoryEvent = {
  id: number
  action: string
  by: string | null
  message: string | null
  createdAt: string
}

export function DocumentHistoryDialog({
  title,
  fetchUrl,
  actionLabel,
  trigger,
}: {
  title: string
  fetchUrl: string
  actionLabel: (action: string) => string
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<DocumentHistoryEvent[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(fetchUrl, { cache: "no-store" })
        if (!res.ok) {
          setEvents([])
          return
        }
        const j = await res.json()
        setEvents(Array.isArray(j?.data) ? j.data : [])
      } catch {
        setEvents([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [open, fetchUrl])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="icon" variant="ghost" title="Historie dokumentu">
            <HistoryIcon className="size-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[90svh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b p-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-5 shrink-0" />
            <span>{title}</span>
            {events && events.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({events.length})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="p-4 sm:px-6">
            {loading || !events ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-8 animate-spin rounded-full border-b-2 border-current" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Načítám historii…
                </span>
              </div>
            ) : events.length === 0 ? (
              <div className="py-8 text-center">
                <HistoryIcon className="mx-auto mb-2 size-12 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Zatím žádné události.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-lg border bg-muted/30 p-3 sm:p-4"
                  >
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <Badge variant="outline" className="w-fit">
                        {actionLabel(event.action)}
                      </Badge>

                      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:items-end">
                        {event.by && (
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 shrink-0" />
                            <span className="break-words font-medium">
                              {event.by}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 shrink-0" />
                          <span>
                            {format(
                              new Date(event.createdAt),
                              "d.M.yyyy HH:mm",
                              { locale: cs }
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {event.message && (
                      <p className="text-sm text-muted-foreground">
                        {event.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
