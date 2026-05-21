"use client"

import * as React from "react"
import { signOut } from "next-auth/react"

import { cn } from "@/lib/utils"

import { Button, type ButtonProps } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

type SignOutButtonProps = Omit<ButtonProps, "onClick">

const SIGNOUT_SUCCESS_REDIRECT = "/signin?logout=success"

export const SignOutButton = React.forwardRef<
  HTMLButtonElement,
  SignOutButtonProps
>(({ className, children, ...props }, ref) => {
  const [pending, startTransition] = React.useTransition()

  function handleSignOut() {
    startTransition(() => {
      void signOut({
        callbackUrl: SIGNOUT_SUCCESS_REDIRECT,
        redirect: true,
      })
    })
  }

  return (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        "flex w-full items-center justify-start px-2 py-1.5 text-sm",
        className
      )}
      disabled={pending}
      onClick={handleSignOut}
      {...props}
    >
      {pending ? (
        <Icons.spinner
          className="mr-2 size-4 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <Icons.logout className="mr-2 size-4" aria-hidden="true" />
      )}

      {children ?? (pending ? "Odhlašuji…" : "Odhlásit se")}
    </Button>
  )
})

SignOutButton.displayName = "SignOutButton"
