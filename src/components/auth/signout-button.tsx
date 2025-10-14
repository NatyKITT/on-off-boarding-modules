"use client"

import * as React from "react"
import { signOut } from "next-auth/react"

import { DEFAULT_SIGNOUT_REDIRECT } from "@/config/defaults"

import { cn } from "@/lib/utils"

import { Button, type ButtonProps } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

type SignOutButtonProps = Omit<ButtonProps, "onClick">

export const SignOutButton = React.forwardRef<
  HTMLButtonElement,
  SignOutButtonProps
>(({ className, children, ...props }, ref) => {
  const [pending, start] = React.useTransition()

  return (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        "flex w-full items-center justify-start px-2 py-1.5 text-sm",
        className
      )}
      disabled={pending}
      onClick={() =>
        start(() =>
          signOut({
            callbackUrl: DEFAULT_SIGNOUT_REDIRECT,
            redirect: true,
          })
        )
      }
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
