"use client"

import { forwardRef } from "react"
import { signOut } from "next-auth/react"

import { DEFAULT_SIGNOUT_REDIRECT } from "@/config/defaults"

import { Button } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

type SignOutButtonProps = React.ComponentPropsWithoutRef<"button">

export const SignOutButton = forwardRef<HTMLButtonElement, SignOutButtonProps>(
  ({ ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className="flex w-full items-center justify-start px-2 py-1.5 text-sm"
        onClick={() =>
          void signOut({
            callbackUrl: DEFAULT_SIGNOUT_REDIRECT,
            redirect: true,
          })
        }
        {...props}
      >
        <Icons.logout className="mr-2 size-4" aria-hidden="true" />
        Odhlásit se
      </Button>
    )
  }
)

SignOutButton.displayName = "SignOutButton"
