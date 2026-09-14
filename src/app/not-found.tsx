import Image from "next/image"
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Image
        src="/assets/illustrations/illustration-error-404.svg"
        alt="Chyba 404"
        width={445}
        height={338}
        className="pointer-events-none mb-6 h-auto w-full max-w-[380px]"
        priority
      />

      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Chyba 404
      </p>

      <h1 className="mt-2 text-3xl font-bold">Stránka nenalezena</h1>

      <p className="mt-3 max-w-md text-balance px-4 text-center text-base text-muted-foreground">
        Tuto stránku nemůžeme nalézt. Doporučujeme pokračovat na hlavní stránku,
        odkud se dostanete do všech částí aplikace.
      </p>

      <Link
        href="/prehled"
        className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        aria-label="Zpět na přehled"
      >
        Zpět na přehled
      </Link>
    </div>
  )
}
