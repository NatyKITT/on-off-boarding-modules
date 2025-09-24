import Link from "next/link"

import { cn } from "@/lib/utils"

import { buttonVariants } from "@/components/ui/button"
import { Icons } from "@/components/shared/icons"

export default function HeroLanding() {
  return (
    <section className="space-y-6 py-12 sm:py-20 lg:py-24">
      <div className="container flex max-w-screen-md flex-col items-center gap-5 text-center">
        <h1 className="text-balance font-satoshi text-[36px] font-black leading-[1.2] tracking-tight sm:text-5xl md:text-6xl md:leading-[1.15]">
          Jednoduchý onboarding systém{" "}
          <span className="bg-gradient-to-r from-green-600 via-blue-600 to-cyan-500 bg-clip-text text-transparent">
            pro váš tým
          </span>
        </h1>

        <p className="max-w-2xl text-balance text-muted-foreground sm:text-lg">
          Automatizujte nástupy zaměstnanců, nastavujte role a procesy, sledujte
          pokrok.
          <br />
          <b>Rychle. Přehledně. Bez zbytečné námahy.</b>
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/prehled"
            prefetch={true}
            className={cn(
              buttonVariants({ rounded: "xl", size: "lg" }),
              "gap-2 px-5 text-[15px]"
            )}
          >
            <span>Vyzkoušet aplikaci</span>
            <Icons.arrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
