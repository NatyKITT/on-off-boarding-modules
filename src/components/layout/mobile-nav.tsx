"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { signIn, useSession } from "next-auth/react"

import { cn } from "@/lib/utils"

import { ModeToggle } from "./mode-toggle"

export function NavMobile() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "auto"
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed right-2 top-2.5 z-50 rounded-full p-2 transition-colors duration-200 hover:bg-muted focus:outline-none active:bg-muted md:hidden",
          open && "hover:bg-muted active:bg-muted"
        )}
        aria-label={open ? "Zavřít menu" : "Otevřít menu"}
      >
        {open ? (
          <X className="size-5 text-muted-foreground" />
        ) : (
          <Menu className="size-5 text-muted-foreground" />
        )}
      </button>

      <nav
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
                    onClick={() => setOpen(false)}
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
                    onClick={() => setOpen(false)}
                    className="flex w-full font-medium capitalize"
                  >
                    Nástupy
                  </Link>
                </li>
              )}
              <li className="py-3">
                <Link
                  href="/prehled"
                  onClick={() => setOpen(false)}
                  className="flex w-full font-medium capitalize"
                >
                  Přehled
                </Link>
              </li>
            </>
          ) : (
            <li className="py-3">
              <button
                onClick={() => {
                  signIn("google")
                  setOpen(false)
                }}
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
