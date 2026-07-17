"use client"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Zástupný obsah pro seznamové stránky (Nástupy/Odchody/Změny), dokud
 * nedoběhne první načtení dat. Zakrývá lištu filtrů i taby/tabulku jedním
 * kusem, ať se filtry neukážou napřed prázdné a pak "nenaskočí" až po datech.
 */
export function ListPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-64" />
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28" />
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
