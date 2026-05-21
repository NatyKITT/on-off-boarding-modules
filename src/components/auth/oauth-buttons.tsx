"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"
import { signIn } from "next-auth/react"

import { DEFAULT_SIGNIN_REDIRECT } from "@/config/defaults"

import { Button } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

type Props = {
  callbackUrl?: string
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84C3.96 20.53 7.68 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.15C1.42 8.53 1 10.21 1 12s.42 3.47 1.15 4.94l3.69-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.68 1 3.96 3.47 2.15 7.06l3.69 2.84C6.71 7.3 9.14 5.37 12 5.37z"
      />
    </svg>
  )
}

function getSafeCallbackUrl(callbackUrl?: string) {
  if (!callbackUrl) return DEFAULT_SIGNIN_REDIRECT

  try {
    const decoded = decodeURIComponent(callbackUrl)

    if (decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded
    }

    return DEFAULT_SIGNIN_REDIRECT
  } catch {
    if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
      return callbackUrl
    }

    return DEFAULT_SIGNIN_REDIRECT
  }
}

function appendSearchParam(url: string, key: string, value: string): string {
  const safeUrl = getSafeCallbackUrl(url)

  const hashIndex = safeUrl.indexOf("#")
  const withoutHash = hashIndex >= 0 ? safeUrl.slice(0, hashIndex) : safeUrl
  const hash = hashIndex >= 0 ? safeUrl.slice(hashIndex) : ""

  const queryIndex = withoutHash.indexOf("?")
  const pathname =
    queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : ""

  const params = new URLSearchParams(search)
  params.set(key, value)

  const query = params.toString()

  return `${pathname}${query ? `?${query}` : ""}${hash}`
}

export function OAuthButtons({
  callbackUrl = DEFAULT_SIGNIN_REDIRECT,
}: Props): JSX.Element {
  const [pending, startTransition] = React.useTransition()

  const safeCallbackUrl = getSafeCallbackUrl(callbackUrl)
  const finalCallbackUrl = appendSearchParam(
    safeCallbackUrl,
    "login",
    "success"
  )

  function handleOAuthSignIn() {
    startTransition(() => {
      void signIn("google", {
        callbackUrl: finalCallbackUrl,
        redirect: true,
      })
    })
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        aria-label="Přihlásit se přes Google"
        onClick={handleOAuthSignIn}
        disabled={pending}
        className="
          h-12
          w-full
          justify-between
          gap-3
          rounded-xl
          border-0
          bg-gradient-to-r
          from-[#00847C]
          to-[#0B6D73]
          px-4
          text-white
          shadow-md
          shadow-emerald-900/10
          transition-all
          hover:from-[#08756E]
          hover:to-[#095D63]
          hover:shadow-lg
          disabled:cursor-not-allowed
          disabled:opacity-80
        "
      >
        <span className="flex items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-white">
            {pending ? (
              <Icons.spinner className="size-4 animate-spin text-[#00847C]" />
            ) : (
              <GoogleLogo className="size-4" />
            )}
          </span>

          <span className="font-medium">
            {pending ? "Přesměrovávám na Google…" : "Přihlásit se přes Google"}
          </span>
        </span>

        {!pending && <ArrowRight className="size-4 opacity-80" />}
      </Button>
    </div>
  )
}
