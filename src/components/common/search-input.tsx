"use client"

import * as React from "react"
import { Search } from "lucide-react"

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
        className={cn("pl-9", className)}
        {...props}
      />
    </div>
  )
}
