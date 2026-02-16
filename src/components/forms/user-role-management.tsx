"use client"

import { useEffect, useState } from "react"
import { Role } from "@prisma/client"
import { InfoIcon, Lock, Plus, ShieldCheck, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Icons } from "@/components/shared/icons"

type DbUser = {
  id: string
  name: string | null
  surname: string | null
  email: string
  role: Role
  canAccessApp: boolean
  createdAt: string
}

type EnvUser = {
  email: string
  role: "ADMIN" | "HR" | "IT" | "READONLY"
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrátor",
  HR: "HR",
  IT: "IT",
  READONLY: "Pouze čtení",
  USER: "Uživatel",
}

const ROLE_BADGE_CLASS: Record<Role, string> = {
  ADMIN: "bg-red-100 text-red-800 border-red-200",
  HR: "bg-green-100 text-green-800 border-green-200",
  IT: "bg-purple-100 text-purple-800 border-purple-200",
  READONLY: "bg-blue-100 text-blue-800 border-blue-200",
  USER: "bg-slate-100 text-slate-800 border-slate-200",
}

const ROLE_ACCESS: Record<Role, string> = {
  ADMIN: "Plný přístup + správa rolí",
  HR: "Celá aplikace, čtení i zápis",
  IT: "Celá aplikace, čtení i zápis",
  READONLY: "Celá aplikace, pouze čtení",
  USER: "Pouze výstupní listy",
}

function RoleLegend() {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="mb-3 text-sm font-medium">Přehled rolí</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
          ([role, label]) => (
            <div key={role} className="flex items-start gap-2">
              <Badge className={`${ROLE_BADGE_CLASS[role]} shrink-0`}>
                {label}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {ROLE_ACCESS[role]}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function AddUserDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("USER")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setEmail("")
    setRole("USER")
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setError("Zadejte email.")
      return
    }
    if (!normalized.endsWith("@praha6.cz")) {
      setError("Lze přidat pouze uživatele s emailem @praha6.cz.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Chyba při přidávání uživatele.")
        return
      }
      toast.success(
        `Uživatel ${normalized} byl přidán s rolí ${ROLE_LABELS[role]}.`
      )
      setOpen(false)
      reset()
      onAdded()
    } catch {
      setError("Nepodařilo se připojit k serveru.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="mr-2 size-4" />
          Přidat uživatele
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat uživatele</DialogTitle>
          <DialogDescription>
            Předregistrujte uživatele @praha6.cz. Přihlásí se přes Google — role
            mu bude přiřazena automaticky dle tohoto záznamu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-email"
              type="email"
              placeholder="jmeno@praha6.cz"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Pouze adresy @praha6.cz
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={loading}
            >
              <SelectTrigger id="add-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                  ([r, label]) => (
                    <SelectItem key={r} value={r}>
                      <span>{label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        — {ROLE_ACCESS[r]}
                      </span>
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Zrušit
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Icons.spinner className="mr-2 size-4 animate-spin" />}
            Přidat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EnvUsersList({ envUsers }: { envUsers: EnvUser[] }) {
  if (envUsers.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Žádné emaily v ENV konfiguraci
      </p>
    )
  }

  return (
    <div className="divide-y rounded-md border">
      {envUsers.map((envUser) => (
        <div
          key={envUser.email}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium">
              {envUser.email}
            </span>
          </div>
          <Badge className={`${ROLE_BADGE_CLASS[envUser.role]} shrink-0`}>
            {ROLE_LABELS[envUser.role]}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function DbUsersList({
  users,
  updatingUserId,
  onRoleChange,
}: {
  users: DbUser[]
  updatingUserId: string | null
  onRoleChange: (userId: string, role: Role) => void
}) {
  if (users.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        Žádní uživatelé. Přidejte uživatele tlačítkem výše nebo se přihlásí
        automaticky přes Google.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {users.map((user) => {
          const fullName = [user.name, user.surname].filter(Boolean).join(" ")
          return (
            <div key={user.id} className="space-y-3 rounded-md border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {fullName ? (
                    <p className="truncate text-sm font-medium">{fullName}</p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      Nepřihlášen/a
                    </p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <Badge className={`${ROLE_BADGE_CLASS[user.role]} shrink-0`}>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Badge
                  variant={user.canAccessApp ? "default" : "outline"}
                  className={
                    user.canAccessApp
                      ? "border-green-200 bg-green-100 text-xs text-green-800"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {user.canAccessApp ? "Aplikace" : "Výstupní listy"}
                </Badge>

                <Select
                  value={user.role}
                  onValueChange={(value: Role) => onRoleChange(user.id, value)}
                  disabled={updatingUserId === user.id}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    {updatingUserId === user.id ? (
                      <Icons.spinner className="size-3 animate-spin" />
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                      ([r, label]) => (
                        <SelectItem key={r} value={r} className="text-xs">
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Jméno
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Přístup
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Role
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Změnit roli
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3">
                  {[user.name, user.surname].filter(Boolean).join(" ") || (
                    <span className="italic text-muted-foreground">
                      Nepřihlášen/a
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.email}
                </td>
                <td className="px-4 py-3">
                  {user.canAccessApp ? (
                    <Badge className="border-green-200 bg-green-100 text-green-800">
                      Aplikace
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Výstupní listy
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge className={ROLE_BADGE_CLASS[user.role]}>
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={user.role}
                    onValueChange={(value: Role) =>
                      onRoleChange(user.id, value)
                    }
                    disabled={updatingUserId === user.id}
                  >
                    <SelectTrigger className="w-[160px]">
                      {updatingUserId === user.id ? (
                        <Icons.spinner className="size-4 animate-spin" />
                      ) : (
                        <SelectValue />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                        ([r, label]) => (
                          <SelectItem key={r} value={r}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function UserRoleManagement() {
  const [envUsers, setEnvUsers] = useState<EnvUser[]>([])
  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const fetchAll = async () => {
    try {
      const [envRes, dbRes] = await Promise.all([
        fetch("/api/admin/env-roles"),
        fetch("/api/admin/users"),
      ])
      const envData = envRes.ok ? await envRes.json() : { envUsers: [] }
      const dbData = dbRes.ok ? await dbRes.json() : { users: [] }

      const fetchedEnvUsers: EnvUser[] = envData.envUsers ?? []
      setEnvUsers(fetchedEnvUsers)

      const envEmails = new Set(fetchedEnvUsers.map((u) => u.email))
      setDbUsers(
        (dbData.users ?? []).filter((u: DbUser) => !envEmails.has(u.email))
      )
    } catch {
      toast.error("Nepodařilo se načíst uživatele.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const updateUserRole = async (userId: string, newRole: Role) => {
    setUpdatingUserId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Chyba při aktualizaci.")
      }
      toast.success("Role byla aktualizována.")
      await fetchAll()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nepodařilo se aktualizovat roli."
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icons.spinner className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <RoleLegend />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-muted-foreground" />
          <h3 className="font-medium">Uživatelé definovaní v ENV</h3>
          <Badge variant="outline" className="text-xs">
            {envUsers.length}
          </Badge>
        </div>

        <Alert>
          <InfoIcon className="size-4" />
          <AlertDescription className="text-sm">
            Role definované v ENV proměnných. Nelze měnit přes toto rozhraní —
            vyžaduje editaci ENV a restart.
          </AlertDescription>
        </Alert>

        <EnvUsersList envUsers={envUsers} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-muted-foreground" />
            <h3 className="font-medium">Ostatní uživatelé @praha6.cz</h3>
            <Badge variant="secondary" className="text-xs">
              {dbUsers.length}
            </Badge>
          </div>
          <AddUserDialog onAdded={fetchAll} />
        </div>

        <p className="text-sm text-muted-foreground">
          Uživatelé registrovaní přihlášením přes Google nebo předregistrovaní
          adminem. Jejich roli lze měnit.
        </p>

        <DbUsersList
          users={dbUsers}
          updatingUserId={updatingUserId}
          onRoleChange={updateUserRole}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Celkem: <strong>{envUsers.length}</strong> ENV uživatelů,{" "}
        <strong>{dbUsers.length}</strong> DB uživatelů
      </p>
    </div>
  )
}
