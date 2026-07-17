"use client"

import { useSession } from "next-auth/react"
import type { Role } from "@prisma/client"

import { isReadonlyRole } from "@/lib/rbac"

export function useCurrentRole(): Role | null {
  const { data: session } = useSession()

  return (session?.user?.role as Role | undefined) ?? null
}

/**
 * READONLY smí všude navigovat a vidět formuláře/detaily, ale nesmí
 * dokončit žádnou mutující akci (uložit, smazat, odeslat e-mail, ...).
 * Použij pro disable/blokování finální akce, ne pro skrývání navigace.
 */
export function useIsReadonly(): boolean {
  const role = useCurrentRole()

  return isReadonlyRole(role)
}
