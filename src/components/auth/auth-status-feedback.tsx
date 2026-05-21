"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, X } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"

type FeedbackState = {
  title: string
  description: string
  variant: "login" | "logout"
} | null

export function AuthStatusFeedback() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [feedback, setFeedback] = React.useState<FeedbackState>(null)

  React.useEffect(() => {
    const loginStatus = searchParams.get("login")
    const logoutStatus = searchParams.get("logout")

    if (loginStatus !== "success" && logoutStatus !== "success") return

    if (loginStatus === "success") {
      setFeedback({
        variant: "login",
        title: "Přihlášení proběhlo úspěšně",
        description: "Jste přihlášeni a můžete pokračovat v práci.",
      })
    }

    if (logoutStatus === "success") {
      setFeedback({
        variant: "logout",
        title: "Byli jste úspěšně odhlášeni",
        description: "Pro další práci se znovu přihlaste přes Google.",
      })
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("login")
    nextParams.delete("logout")

    const nextQuery = nextParams.toString()
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname

    router.replace(nextUrl, { scroll: false })
  }, [pathname, router, searchParams])

  React.useEffect(() => {
    if (!feedback) return

    const timeout = window.setTimeout(() => {
      setFeedback(null)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [feedback])

  if (!feedback) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-center px-4 sm:justify-end sm:px-6">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border bg-white p-4 text-sm shadow-xl shadow-black/10",
          "duration-200 animate-in fade-in-0 slide-in-from-top-2",
          "dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
          <CheckCircle2 className="size-6 text-[#00847C]" />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold text-slate-950 dark:text-slate-50">
            {feedback.title}
          </p>
          <p className="mt-0.5 text-slate-600 dark:text-slate-300">
            {feedback.description}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-full text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-50"
          onClick={() => setFeedback(null)}
          aria-label="Zavřít oznámení"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
