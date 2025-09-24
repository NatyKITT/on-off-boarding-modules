"use client"

import * as React from "react"
import { signIn } from "next-auth/react"

import { DEFAULT_SIGNIN_REDIRECT } from "@/config/defaults"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

export function OAuthButtons(): JSX.Element {
  const { toast } = useToast()

  async function handleOAuthSignIn(provider: "google"): Promise<void> {
    try {
      await signIn(provider, {
        callbackUrl: DEFAULT_SIGNIN_REDIRECT,
      })

      toast({
        title: "Přihlášení úspěšné",
        description: "Byli jste úspěšně přihlášeni přes Google účet.",
      })
    } catch (error) {
      toast({
        title: "Chyba při přihlášení",
        description: "Zkuste to prosím znovu.",
        variant: "destructive",
      })

      console.error(error)
      throw new Error(`Chyba při přihlašování přes ${provider}`)
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
      <Button
        aria-label="Přihlášení přes Google"
        variant="outline"
        onClick={() => void handleOAuthSignIn("google")}
        className="w-full sm:w-auto"
      >
        <Icons.google className="mr-2 size-4" />
        Přihlásit se přes Google
      </Button>
    </div>
  )
}
