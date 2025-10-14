"use client"

import { useCallback, useEffect, useId, useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { signIn, useSession } from "next-auth/react"

import { DEFAULT_SIGNIN_REDIRECT } from "@/config/defaults"

import { cn } from "@/lib/utils"

import { ModeToggle } from "./mode-toggle"

export function NavMobile() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = open ? "hidden" : "auto"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const close = useCallback(() => setOpen(false), [])

  const handleSignIn = useCallback(() => {
    void signIn("google", { callbackUrl: DEFAULT_SIGNIN_REDIRECT })
    setOpen(false)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-2 top-2.5 z-50 rounded-full p-2 transition-colors duration-200 hover:bg-muted focus:outline-none active:bg-muted md:hidden",
          open && "hover:bg-muted active:bg-muted"
        )}
        aria-label={open ? "Zavřít menu" : "Otevřít menu"}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {open ? (
          <X className="size-5 text-muted-foreground" />
        ) : (
          <Menu className="size-5 text-muted-foreground" />
        )}
      </button>

      <nav
        id={panelId}
        className={cn(
          "fixed inset-0 z-20 hidden w-full overflow-auto bg-background px-5 py-16 lg:hidden",
          open && "block"
        )}
      >
        <ul className="grid divide-y divide-muted">
          {session ? (
            <>
              {session.user.role === "ADMIN" && (
                <li className="py-3">
                  <Link
                    href="/admin"
                    onClick={close}
                    className="flex w-full font-medium capitalize"
                  >
                    Admin
                  </Link>
                </li>
              )}
              {session.user.role === "HR" && (
                <li className="py-3">
                  <Link
                    href="/nastupy"
                    onClick={close}
                    className="flex w-full font-medium capitalize"
                  >
                    Nástupy
                  </Link>
                </li>
              )}
              <li className="py-3">
                <Link
                  href="/prehled"
                  onClick={close}
                  className="flex w-full font-medium capitalize"
                >
                  Přehled
                </Link>
              </li>
            </>
          ) : (
            <li className="py-3">
              <button
                type="button"
                onClick={handleSignIn}
                className="flex w-full font-medium capitalize"
              >
                Přihlásit se Googlem
              </button>
            </li>
          )}
        </ul>

        <div className="mt-5 flex items-center justify-end space-x-4">
          <ModeToggle />
        </div>
      </nav>
    </>
  )
}
