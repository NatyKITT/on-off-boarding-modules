"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import type { Role } from "@prisma/client"
import {
  ArrowLeftRight,
  Eye,
  LayoutDashboard,
  Lock,
  LogOut,
  Settings,
  UserMinus,
  UserPlus,
} from "lucide-react"
import { signOut, useSession } from "next-auth/react"
import { Drawer } from "vaul"

import { useMediaQuery } from "@/hooks/use-media-query"
import { roleLabel } from "@/lib/rbac"

import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/shared/user-avatar"

const SIGNOUT_SUCCESS_REDIRECT = "/signin?logout=success"

const ROLE_BADGE_VARIANT: Record<string, "secondary" | "outline"> = {
  ADMIN: "secondary",
  HR: "secondary",
  IT: "secondary",
  READONLY: "outline",
}

type SessionUserWithSurname = {
  name?: string | null
  surname?: string | null
  email?: string | null
  image?: string | null
  role?: Role | null
}

type MenuItem = {
  href: string
  label: string
  icon: ReactNode
  show: boolean
}

function buildDisplayName(user: SessionUserWithSurname) {
  const name = user.name?.trim() ?? ""
  const surname = user.surname?.trim() ?? ""

  if (!name && !surname) return user.email ?? "Uživatel"
  if (!surname) return name
  if (!name) return surname

  if (name.toLowerCase().includes(surname.toLowerCase())) {
    return name
  }

  return `${name} ${surname}`
}

function RoleBadge({ role }: { role?: Role | null }) {
  const variant = role ? ROLE_BADGE_VARIANT[role] : undefined
  if (!role || !variant) return null

  return (
    <Badge
      variant={variant}
      className="mt-1 w-fit rounded-full px-3 py-0.5 text-[11px] font-semibold"
    >
      {role === "READONLY" && <Eye className="mr-1 size-3" />}
      {roleLabel(role)}
    </Badge>
  )
}

function DesktopMenuLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: ReactNode
}) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href} className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </Link>
    </DropdownMenuItem>
  )
}

function MobileMenuLink({
  href,
  label,
  icon,
  onClick,
}: {
  href: string
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-foreground hover:bg-muted"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className="text-base">{label}</span>
      </Link>
    </li>
  )
}

export function UserAccountNav() {
  const { data: session } = useSession()
  const rawUser = session?.user as SessionUserWithSurname | undefined

  const [open, setOpen] = useState(false)
  const { isMobile } = useMediaQuery()

  if (!rawUser) {
    return <div className="size-8 animate-pulse rounded-full border bg-muted" />
  }

  const role = rawUser.role ?? "USER"
  const isAdmin = role === "ADMIN"

  const canAccessInternalApp =
    role === "ADMIN" || role === "HR" || role === "IT" || role === "READONLY"

  const displayName = buildDisplayName(rawUser)

  const avatarUser = {
    name: rawUser.name ?? null,
    surname: rawUser.surname ?? null,
    email: rawUser.email ?? null,
    image: rawUser.image ?? null,
  }

  const menuItems: MenuItem[] = [
    {
      href: "/admin",
      label: "Administrace",
      icon: <Lock className="size-4" />,
      show: isAdmin,
    },
    {
      href: "/prehled",
      label: "Přehled",
      icon: <LayoutDashboard className="size-4" />,
      show: canAccessInternalApp,
    },
    {
      href: "/nastupy",
      label: "Nástupy",
      icon: <UserPlus className="size-4" />,
      show: canAccessInternalApp,
    },
    {
      href: "/odchody",
      label: "Odchody",
      icon: <UserMinus className="size-4" />,
      show: canAccessInternalApp,
    },
    {
      href: "/zmeny",
      label: "Změny",
      icon: <ArrowLeftRight className="size-4" />,
      show: canAccessInternalApp,
    },
    {
      href: "/nastaveni",
      label: "Nastavení",
      icon: <Settings className="size-4" />,
      show: isAdmin,
    },
  ]

  const visibleMenuItems = menuItems.filter((item) => item.show)

  function closeMenu() {
    setOpen(false)
  }

  function handleSignOut() {
    void signOut({
      callbackUrl: SIGNOUT_SUCCESS_REDIRECT,
      redirect: true,
    })
  }

  const userInfo = (
    <div className="min-w-0 flex-1">
      <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-foreground">
        {displayName}
      </p>

      {rawUser.email && (
        <p className="mt-0.5 break-all text-xs leading-snug text-muted-foreground">
          {rawUser.email}
        </p>
      )}

      <RoleBadge role={role} />
    </div>
  )

  if (isMobile) {
    return (
      <Drawer.Root open={open} onOpenChange={setOpen} direction="top">
        <Drawer.Trigger asChild>
          <button
            type="button"
            className="rounded-full"
            aria-label="Uživatelské menu"
          >
            <UserAvatar
              user={avatarUser}
              className="size-9 border"
              aria-label="Uživatelské menu"
            />
          </button>
        </Drawer.Trigger>

        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            onClick={closeMenu}
          />

          <Drawer.Content
            className="
            fixed inset-x-0 top-0 z-50 rounded-b-2xl border-b bg-background
            px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]
            shadow-2xl
          "
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Drawer.Title className="sr-only">Uživatelské menu</Drawer.Title>

            <div className="mb-3 flex w-full justify-center">
              <div className="h-1.5 w-16 rounded-full bg-muted-foreground/20" />
            </div>

            <div className="flex w-full items-start gap-3 pb-4">
              <UserAvatar user={avatarUser} className="mt-0.5 size-11 border" />
              {userInfo}
            </div>

            <ul role="list" className="space-y-1">
              {visibleMenuItems.map((item) => (
                <MobileMenuLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  onClick={closeMenu}
                />
              ))}

              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-2.5 py-2 text-left"
                  onClick={(event) => {
                    event.preventDefault()
                    closeMenu()
                    handleSignOut()
                  }}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center">
                    <LogOut className="size-4" />
                  </span>
                  <span className="text-base">Odhlásit se</span>
                </button>
              </li>
            </ul>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          className="rounded-full"
        >
          <UserAvatar
            user={avatarUser}
            className="size-8 border"
            aria-label="Uživatelské menu"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex w-full items-start gap-3 p-3">
          <UserAvatar user={avatarUser} className="mt-0.5 size-10 border" />
          {userInfo}
        </div>

        <DropdownMenuSeparator />

        {visibleMenuItems.map((item) => (
          <DesktopMenuLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
          />
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={(event) => {
            event.preventDefault()
            handleSignOut()
          }}
        >
          <div className="flex items-center gap-2.5">
            <LogOut className="size-4" />
            <span>Odhlásit se</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
