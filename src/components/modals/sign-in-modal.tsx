"use client"

import { Dispatch, SetStateAction, useCallback, useMemo, useState } from "react"
import Image from "next/image"
import { signIn } from "next-auth/react"

import { siteConfig } from "@/config/site"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Icons } from "@/components/shared/icons"

const DEFAULT_SIGNIN_REDIRECT = "/prehled"

function SignInModal({
  showSignInModal,
  setShowSignInModal,
}: {
  showSignInModal: boolean
  setShowSignInModal: Dispatch<SetStateAction<boolean>>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    try {
      setLoading(true)
      setError(null)
      await signIn("google", {
        callbackUrl: DEFAULT_SIGNIN_REDIRECT,
        redirect: true,
      })
    } catch (err) {
      console.error("SignIn error:", err)
      setError("Přihlášení se nezdařilo. Zkuste to prosím znovu.")
      setLoading(false)
    }
  }

  return (
    <Modal showModal={showSignInModal} setShowModal={setShowSignInModal}>
      <div className="w-full">
        <div className="flex flex-col items-center justify-center space-y-3 border-b bg-background px-4 py-6 pt-8 text-center md:px-16">
          <a href={siteConfig.url}>
            <Image
              src="/assets/icons/onboarding.svg"
              alt={`${siteConfig.name} logo`}
              width={40}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </a>
          <h3 className="font-satoshi text-2xl font-black">Přihlášení</h3>
          <p className="text-sm text-muted-foreground">
            Přihlaste se Google účtem organizace (např.{" "}
            <span className="font-mono">jmeno@praha6.cz</span>)
          </p>
        </div>

        <div className="flex flex-col space-y-4 bg-secondary/50 px-4 py-8 md:px-16">
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <Button variant="default" disabled={loading} onClick={handleSignIn}>
            {loading ? (
              <Icons.spinner className="mr-2 size-4 animate-spin" />
            ) : (
              <Icons.google className="mr-2 size-4" />
            )}
            Přihlásit se přes Google
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function useSignInModal() {
  const [showSignInModal, setShowSignInModal] = useState(false)
  const SignInModalCallback = useCallback(
    () => (
      <SignInModal
        showSignInModal={showSignInModal}
        setShowSignInModal={setShowSignInModal}
      />
    ),
    [showSignInModal, setShowSignInModal]
  )
  return useMemo(
    () => ({ setShowSignInModal, SignInModal: SignInModalCallback }),
    [setShowSignInModal, SignInModalCallback]
  )
}
