import { ReactNode } from "react"

import { cn } from "@/lib/utils"

export default function MaxWidthWrapper({
  className,
  children,
  large = false,
}: {
  className?: string
  large?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8",
        large ? "max-w-screen-2xl" : "max-w-7xl",
        className
      )}
    >
      {children}
    </div>
  )
}
