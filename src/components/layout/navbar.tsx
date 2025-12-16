"use client"

import { useContext } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSelectedLayoutSegment } from "next/navigation"
import { useSession } from "next-auth/react"

import { siteConfig } from "@/config/site"

import { useScroll } from "@/hooks/use-scroll"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ModalContext } from "@/components/modals/providers"
import { Icons } from "@/components/shared/icons"
import MaxWidthWrapper from "@/components/shared/max-width-wrapper"

interface NavBarProps {
  scroll?: boolean
  large?: boolean
}

export function NavBar({ scroll = false }: NavBarProps) {
  const scrolled = useScroll(50)
  const { data: session, status } = useSession()
  const { setShowSignInModal } = useContext(ModalContext)

  const selectedLayout = useSelectedLayoutSegment()
  const documentation = selectedLayout === "docs"

  return (
    <header
      role="banner"
      className={`sticky top-0 z-40 flex w-full justify-center bg-background/60 backdrop-blur-xl transition-all ${
        scroll ? (scrolled ? "border-b" : "bg-transparent") : "border-b"
      }`}
    >
      <MaxWidthWrapper
        className="flex h-14 items-center justify-between py-4"
        large={documentation}
      >
        <div className="flex gap-6 md:gap-10">
          <Link href="/prehled" className="flex items-center space-x-1.5">
            <Image
              src="/assets/icons/onboarding.svg"
              alt={`${siteConfig.name} logo`}
              width={32}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <span className="font-satoshi text-xl font-bold">
              {siteConfig.name}
            </span>
          </Link>
        </div>

        <div className="flex items-center space-x-3">
          {session ? (
            <Link
              href={session.user.role === "ADMIN" ? "/admin" : "/prehled"}
              className="hidden md:block"
            >
              <Button
                className="gap-2 px-4"
                variant="default"
                size="sm"
                rounded="xl"
              >
                <span>Přehled</span>
              </Button>
            </Link>
          ) : status === "unauthenticated" ? (
            <Button
              className="hidden gap-2 px-4 md:flex"
              variant="default"
              size="sm"
              rounded="lg"
              onClick={() => setShowSignInModal(true)}
            >
              <span>Přihlásit se</span>
              <Icons.arrowRight className="size-4" />
            </Button>
          ) : (
            <Skeleton className="hidden h-9 w-24 rounded-xl lg:flex" />
          )}
        </div>
      </MaxWidthWrapper>
    </header>
  )
}
