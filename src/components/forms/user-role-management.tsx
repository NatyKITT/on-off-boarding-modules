"use client"

import { useEffect, useState } from "react"
import { Role } from "@prisma/client"
import { InfoIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Icons } from "@/components/shared/icons"

type User = {
  id: string
  name: string | null
  surname: string | null
  email: string
  role: Role
  canAccessApp: boolean
  personalNumber: string | null
  createdAt: Date
}

const ROLE_LABELS: Record<Role, string> = {
  USER: "Uživatel",
  READONLY: "Pouze čtení",
  HR: "HR",
  IT: "IT",
  ADMIN: "Administrátor",
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  USER: "Přístup pouze k public exit checklist URL (podpisování)",
  READONLY: "Čtení všech dat, může podepisovat výstupní listy",
  HR: "Správa nástupu/výstupu + dokumenty (vše kromě /admin)",
  IT: "Správa nástupu/výstupu + dokumenty (vše kromě /admin)",
  ADMIN: "Plná správa systému včetně rolí uživatelů",
}

const ROLE_COLORS: Record<Role, string> = {
  USER: "bg-slate-100 text-slate-800 border-slate-200",
  READONLY: "bg-blue-100 text-blue-800 border-blue-200",
  HR: "bg-green-100 text-green-800 border-green-200",
  IT: "bg-purple-100 text-purple-800 border-purple-200",
  ADMIN: "bg-red-100 text-red-800 border-red-200",
}

function isProtectedEmail(email: string): boolean {
  const protectedEmails = [
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ?? "",
    process.env.NEXT_PUBLIC_HR_EMAILS ?? "",
    process.env.NEXT_PUBLIC_IT_EMAILS ?? "",
    process.env.NEXT_PUBLIC_READONLY_EMAILS ?? "",
  ]
    .join(",")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)

  return protectedEmails.includes(email.toLowerCase())
}

export function UserRoleManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users")
      if (!res.ok) throw new Error("Failed to fetch")

      const data = await res.json()
      setUsers(data.users)
    } catch (error) {
      console.error("Error fetching users:", error)
      toast.error("Nepodařilo se načíst seznam uživatelů")
    } finally {
      setLoading(false)
    }
  }

  const updateUserRole = async (userId: string, newRole: Role) => {
    setUpdatingUserId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Update failed")
      }

      toast.success("Role byla úspěšně aktualizována")
      await fetchUsers()
    } catch (error) {
      console.error("Error updating role:", error)
      toast.error(
        error instanceof Error
          ? error.message
          : "Nepodařilo se aktualizovat roli"
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icons.spinner className="size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Alert>
        <InfoIcon className="size-4" />
        <AlertTitle>Automatická registrace a role z ENV</AlertTitle>
        <AlertDescription>
          Uživatelé s emailem @praha6.cz se automaticky registrují při prvním
          přihlášení. Role <strong>ADMIN, HR, IT, READONLY</strong> jsou
          automaticky přiřazeny z ENV proměnných. Ostatní dostávají roli{" "}
          <strong>USER</strong> a vidí pouze /no-access stránku (mohou
          podepisovat public exit checklist URL).
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-muted/50 p-4">
        <h3 className="mb-3 font-medium">Popis rolí a oprávnění</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
            <div key={role} className="flex items-start gap-2">
              <Badge className={ROLE_COLORS[role as Role]}>
                {ROLE_LABELS[role as Role]}
              </Badge>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Uživatel</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Os. číslo</TableHead>
              <TableHead>Současná role</TableHead>
              <TableHead>Změnit roli</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Žádní registrovaní uživatelé
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const protected_ = isProtectedEmail(user.email)

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">
                        {[user.name, user.surname].filter(Boolean).join(" ") ||
                          "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {user.email}
                        </span>
                        {protected_ && (
                          <Badge variant="outline" className="text-xs">
                            Chráněno (ENV)
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {user.personalNumber || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {protected_ ? (
                        <span className="text-sm text-muted-foreground">
                          Role nelze změnit
                        </span>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(value: Role) =>
                            updateUserRole(user.id, value)
                          }
                          disabled={updatingUserId === user.id}
                        >
                          <SelectTrigger className="w-[180px]">
                            {updatingUserId === user.id ? (
                              <Icons.spinner className="size-4 animate-spin" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS).map(
                              ([role, label]) => (
                                <SelectItem key={role} value={role}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Celkem registrováno: <strong>{users.length}</strong> uživatelů
      </div>
    </div>
  )
}
