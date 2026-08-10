"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { Input, type InputProps } from "@/components/ui/input"

type SearchInputProps = Omit<InputProps, "value" | "onChange" | "type"> & {
  value: string
  onChange: (value: string) => void
  wrapperClassName?: string
}

export function SearchInput({
  value,
  onChange,
  className,
  wrapperClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative min-w-[240px] flex-1", wrapperClassName)}>
      <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("pl-9", value ? "pr-8" : "", className)}
        {...props}
      />
      {value && (
        <button
          type="button"
          title="Vymazat vyhledávání"
          aria-label="Vymazat vyhledávání"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange("")}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
