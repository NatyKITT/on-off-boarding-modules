"use client"

import * as React from "react"
import { signIn } from "next-auth/react"

import { DEFAULT_SIGNIN_REDIRECT } from "@/config/defaults"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

export function OAuthButtons(): JSX.Element {
  const { toast } = useToast()

  async function handleOAuthSignIn() {
    try {
      await signIn("google", { callbackUrl: DEFAULT_SIGNIN_REDIRECT })
      toast({
        title: "Přihlášení úspěšné",
        description: "Byli jste úspěšně přihlášeni přes Google účet.",
      })
    } catch (error) {
      console.error(error)
      toast({
        title: "Chyba při přihlášení",
        description: "Zkuste to prosím znovu.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        aria-label="Přihlásit se přes Google"
        onClick={() => void handleOAuthSignIn()}
        className="
          w-full
          justify-center
          gap-2
          rounded-lg
          border
          bg-white text-black
          hover:bg-white/90
          dark:bg-white dark:text-black dark:hover:bg-white/90
        "
      >
        <Icons.google className="size-4" />
        Přihlásit se přes Google
      </Button>
    </div>
  )
}
