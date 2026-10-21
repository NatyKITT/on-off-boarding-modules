"use client"

import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

export type BulkSelectableRecord = {
  id: number
  label: string
  dateLabel: string
  monthKey: string
  monthLabel: string
}

type Props = {
  records: BulkSelectableRecord[]
  selected: number[]
  onToggle: (id: number) => void
  onToggleMany: (ids: number[], checked: boolean) => void
}

export function BulkSelectableRecordList({
  records,
  selected,
  onToggle,
  onToggleMany,
}: Props) {
  const months = useMemo(() => {
    const map = new Map<
      string,
      { label: string; rows: BulkSelectableRecord[] }
    >()
    records.forEach((record) => {
      const existing = map.get(record.monthKey)
      if (existing) existing.rows.push(record)
      else
        map.set(record.monthKey, { label: record.monthLabel, rows: [record] })
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [records])

  return (
    <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
      {months.map(([monthKey, { label, rows }]) => {
        const ids = rows.map((row) => row.id)
        const checkedCount = ids.filter((id) => selected.includes(id)).length
        const allChecked = checkedCount === ids.length
        const someChecked = checkedCount > 0 && !allChecked

        return (
          <div key={monthKey} className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
              <Checkbox
                checked={
                  allChecked ? true : someChecked ? "indeterminate" : false
                }
                onCheckedChange={(checked) =>
                  onToggleMany(ids, checked === true)
                }
              />
              {label}
              <Badge variant="outline" className="font-normal">
                {ids.length}
              </Badge>
            </label>

            <div className="space-y-1 pl-1">
              {rows.map((row) => (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onCheckedChange={() => onToggle(row.id)}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.dateLabel}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
