"use client"

import * as React from "react"
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type ActiveFilterGroup = {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
  onRemove: (value: string) => void
}

type ActiveFilterChipsProps = {
  groups: ActiveFilterGroup[]
  onClearAll: () => void
}

export function ActiveFilterChips({
  groups,
  onClearAll,
}: ActiveFilterChipsProps) {
  const activeGroups = groups.filter((group) => group.values.length > 0)

  if (activeGroups.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeGroups.map((group) => (
        <div
          key={group.key}
          className="flex flex-wrap items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {group.label}:
          </span>

          {group.values.map((item) => (
            <Badge
              key={`${group.key}-${item.value}`}
              variant="secondary"
              className="flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 font-normal"
            >
              <span className="max-w-[160px] truncate">{item.label}</span>
              <button
                type="button"
                onClick={() => group.onRemove(item.value)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Odebrat filtr ${group.label}: ${item.label}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClearAll}
        className="h-6 px-2 text-xs text-muted-foreground"
      >
        Zrušit filtry
      </Button>
    </div>
  )
}
