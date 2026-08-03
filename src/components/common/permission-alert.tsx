import type { Role } from "@prisma/client"
import { Lock } from "lucide-react"

import { roleLabel } from "@/lib/rbac"
import { cn } from "@/lib/utils"

interface PermissionAlertProps {
  role?: Role | null
  message?: string
  className?: string
}

export function PermissionAlert({
  role,
  message = "Nemáte oprávnění k této akci.",
  className,
}: PermissionAlertProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800",
        className
      )}
    >
      <Lock className="size-3 shrink-0" />
      <span>
        {message} {role && `Vaše role: ${roleLabel(role)}. `}Pokud tuto akci
        potřebujete provést, obraťte se na IT.
      </span>
    </div>
  )
}
