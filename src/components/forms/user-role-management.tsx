"use client"

import { useEffect, useState } from "react"
import { Role } from "@prisma/client"
import {
  AlertTriangle,
  InfoIcon,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react"
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
  canAccessApp?: boolean
  source?: "ENV"
}

type RemoveDialogUser = {
  id: string
  email: string
  name: string | null
  surname: string | null
  role: Role
} | null

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

function getFullName(user: Pick<DbUser, "name" | "surname">) {
  return [user.name, user.surname].filter(Boolean).join(" ").trim()
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

  function reset() {
    setEmail("")
    setRole("USER")
    setError(null)
  }

  async function handleSubmit() {
    setError(null)

    const normalized = email.trim().toLowerCase()

    if (!normalized) {
      setError("Zadejte e-mail.")
      return
    }

    if (!normalized.includes("@")) {
      setError("Zadejte platný e-mail.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, role }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setError(data?.error ?? "Chyba při přidávání uživatele.")
        return
      }

      const createdRole = data?.user?.role as Role | undefined

      toast.success(
        `Uživatel ${normalized} byl přidán s rolí ${
          createdRole ? ROLE_LABELS[createdRole] : ROLE_LABELS[role]
        }.`
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
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) reset()
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
            Předregistrujte uživatele s povolenou firemní doménou. Po přihlášení
            přes Google se jeho účet propojí s tímto záznamem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-email">
              E-mail <span className="text-destructive">*</span>
            </Label>

            <Input
              id="add-email"
              type="email"
              placeholder="jmeno@praha6.cz"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSubmit()
              }}
              disabled={loading}
            />

            <p className="text-xs text-muted-foreground">
              Povolené domény kontroluje server podle konfigurace.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-role">Role</Label>

            <Select
              value={role}
              onValueChange={(value) => setRole(value as Role)}
              disabled={loading}
            >
              <SelectTrigger id="add-role">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {(Object.entries(ROLE_LABELS) as [Role, string][]).map(
                  ([itemRole, label]) => (
                    <SelectItem key={itemRole} value={itemRole}>
                      <span>{label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        — {ROLE_ACCESS[itemRole]}
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

          <Button onClick={() => void handleSubmit()} disabled={loading}>
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
        Žádné e-maily v ENV konfiguraci.
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
  onRemoveUser,
}: {
  users: DbUser[]
  updatingUserId: string | null
  onRoleChange: (userId: string, role: Role) => void
  onRemoveUser: (user: DbUser) => void
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
                  onValueChange={(value) =>
                    onRoleChange(user.id, value as Role)
                  }
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
                      ([itemRole, label]) => (
                        <SelectItem
                          key={itemRole}
                          value={itemRole}
                          className="text-xs"
                        >
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                disabled={updatingUserId === user.id}
                onClick={() => onRemoveUser(user)}
              >
                <Trash2 className="mr-2 size-4" />
                Odebrat uživatele
              </Button>
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
                E-mail
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Akce
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
                    onValueChange={(value) =>
                      onRoleChange(user.id, value as Role)
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
                        ([itemRole, label]) => (
                          <SelectItem key={itemRole} value={itemRole}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={updatingUserId === user.id}
                    onClick={() => onRemoveUser(user)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Odebrat
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function RemoveUserDialog({
  user,
  loading,
  onCancel,
  onConfirm,
}: {
  user: RemoveDialogUser
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const fullName = user ? getFullName(user) : ""

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>

          <DialogTitle>Odebrat uživatele?</DialogTitle>

          <DialogDescription>
            Tuto akci potvrďte pouze v případě, že uživatel už nemá mít přístup
            do aplikace.
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm font-medium">
                {fullName || "Nepřihlášený uživatel"}
              </p>

              <p className="mt-0.5 break-all text-sm text-muted-foreground">
                {user.email}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className={ROLE_BADGE_CLASS[user.role]}>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>
            </div>

            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-sm">
                Pokud má uživatel vazby v systému, nebude fyzicky smazán.
                Aplikace mu pouze odebere přístup a nastaví roli{" "}
                <strong>Uživatel</strong>. Pokud vazby nemá, může být odstraněn
                úplně.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Zrušit
          </Button>

          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={loading || !user}
          >
            {loading && <Icons.spinner className="mr-2 size-4 animate-spin" />}
            Odebrat uživatele
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UserRoleManagement() {
  const [envUsers, setEnvUsers] = useState<EnvUser[]>([])
  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [removeDialogUser, setRemoveDialogUser] =
    useState<RemoveDialogUser>(null)

  async function fetchAll() {
    try {
      setLoading(true)

      const [envRes, dbRes] = await Promise.all([
        fetch("/api/admin/env-roles", { cache: "no-store" }),
        fetch("/api/admin/users", { cache: "no-store" }),
      ])

      const envData = envRes.ok ? await envRes.json() : { envUsers: [] }
      const dbData = dbRes.ok ? await dbRes.json() : { users: [] }

      const fetchedEnvUsers: EnvUser[] = envData.envUsers ?? []
      setEnvUsers(fetchedEnvUsers)

      const envEmails = new Set(
        fetchedEnvUsers.map((envUser) => envUser.email.toLowerCase())
      )

      setDbUsers(
        (dbData.users ?? []).filter((dbUser: DbUser) => {
          return !envEmails.has(dbUser.email.toLowerCase())
        })
      )
    } catch {
      toast.error("Nepodařilo se načíst uživatele.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAll()
  }, [])

  async function updateUserRole(userId: string, newRole: Role) {
    setUpdatingUserId(userId)

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.error ?? "Chyba při aktualizaci.")
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

  async function removeUser() {
    if (!removeDialogUser) return

    setUpdatingUserId(removeDialogUser.id)

    try {
      const res = await fetch(`/api/admin/users/${removeDialogUser.id}`, {
        method: "DELETE",
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error ?? "Uživatele se nepodařilo odebrat.")
      }

      toast.success(data?.message ?? "Uživatel byl odebrán.")
      setRemoveDialogUser(null)
      await fetchAll()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Uživatele se nepodařilo odebrat."
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

  const removeDialogLoading = Boolean(
    removeDialogUser && updatingUserId === removeDialogUser.id
  )

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
            Role definované v ENV proměnných. Nelze měnit ani odebrat přes toto
            rozhraní — vyžaduje editaci ENV a restart aplikace.
          </AlertDescription>
        </Alert>

        <EnvUsersList envUsers={envUsers} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-muted-foreground" />
            <h3 className="font-medium">Ostatní uživatelé mimo ENV</h3>
            <Badge variant="secondary" className="text-xs">
              {dbUsers.length}
            </Badge>
          </div>

          <AddUserDialog onAdded={fetchAll} />
        </div>

        <p className="text-sm text-muted-foreground">
          Uživatelé registrovaní přihlášením přes Google nebo předregistrovaní
          administrátorem. Jejich roli lze měnit a lze jim odebrat přístup.
        </p>

        <DbUsersList
          users={dbUsers}
          updatingUserId={updatingUserId}
          onRoleChange={updateUserRole}
          onRemoveUser={(user) =>
            setRemoveDialogUser({
              id: user.id,
              email: user.email,
              name: user.name,
              surname: user.surname,
              role: user.role,
            })
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Celkem: <strong>{envUsers.length}</strong> ENV uživatelů,{" "}
        <strong>{dbUsers.length}</strong> DB uživatelů mimo ENV.
      </p>

      <RemoveUserDialog
        user={removeDialogUser}
        loading={removeDialogLoading}
        onCancel={() => {
          if (!removeDialogLoading) setRemoveDialogUser(null)
        }}
        onConfirm={() => void removeUser()}
      />
    </div>
  )
}
