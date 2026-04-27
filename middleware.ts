import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"
import type { Session } from "next-auth"

type SessionUser = {
  id: string
  role?: Role
  canAccessApp?: boolean
  email?: string | null
}

type SessionWithUser = Session & { user: SessionUser }

function getDomain(email?: string | null) {
  return (email ?? "").split("@")[1]?.toLowerCase() ?? ""
}

function isPraha6(email?: string | null) {
  return getDomain(email) === "praha6.cz"
}

function isKitt6(email?: string | null) {
  return getDomain(email) === "kitt6.cz"
}

function isPraha6OrKitt6(email?: string | null) {
  return isPraha6(email) || isKitt6(email)
}

function jsonError(status: number, message: string) {
  return new NextResponse(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isMutatingMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
}

export default auth((req) => {
  const session = req.auth as SessionWithUser | null
  const path = req.nextUrl.pathname
  const method = req.method
  const isApi = path.startsWith("/api")

  const publicPaths = [
    "/signin",
    "/terms",
    "/privacy",
    "/api/auth",
    "/api/health",
    "/dokumenty/",
    "/api/dokumenty/public",
  ]

  const isPublicExitPage = path.startsWith("/odchody-public/")
  const isPublicExitApi = path.startsWith("/api/odchody/public/")
  const isInternalExitChecklistApi =
    /^\/api\/odchody\/\d+\/exit-checklist(\/.*)?$/.test(path)
  const isInternalExitChecklistPage =
    /^\/odchody\/\d+\/vystupni-list(\/.*)?$/.test(path)

  if (publicPaths.some((p) => path.startsWith(p))) {
    return NextResponse.next()
  }

  if (!session?.user) {
    if (isPublicExitPage) {
      const signInUrl = new URL("/signin", req.url)
      signInUrl.searchParams.set(
        "callbackUrl",
        `${req.nextUrl.pathname}${req.nextUrl.search}`
      )
      return NextResponse.redirect(signInUrl)
    }

    if (isPublicExitApi) {
      return jsonError(401, "Nejste přihlášen(a).")
    }

    if (isApi) return jsonError(401, "Nejste přihlášen(a).")

    const signInUrl = new URL("/signin", req.url)
    signInUrl.searchParams.set(
      "callbackUrl",
      `${req.nextUrl.pathname}${req.nextUrl.search}`
    )
    return NextResponse.redirect(signInUrl)
  }

  const role = (session.user.role ?? "USER") as Role
  const canAccessApp = Boolean(session.user.canAccessApp)
  const email = session.user.email ?? null

  if (path === "/") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }

  if (isPublicExitPage || isPublicExitApi) {
    if (!isPraha6OrKitt6(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro účty Praha 6 nebo KITT6.")
        : NextResponse.redirect(new URL("/no-access", req.url))
    }

    return NextResponse.next()
  }

  if (role === "USER") {
    if (isInternalExitChecklistPage || isInternalExitChecklistApi) {
      return NextResponse.next()
    }

    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : NextResponse.redirect(new URL("/no-access", req.url))
  }

  if (role === "READONLY" && isApi && isMutatingMethod(method)) {
    const allowedReadonlyMutations =
      isInternalExitChecklistApi || isPublicExitApi

    if (!allowedReadonlyMutations) {
      return jsonError(
        403,
        "Máte pouze režim pro čtení. Pro úpravy kontaktujte administrátora."
      )
    }
  }

  if (!canAccessApp && role !== "READONLY") {
    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : NextResponse.redirect(new URL("/no-access", req.url))
  }

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    if (role !== "ADMIN") {
      return isApi
        ? jsonError(403, "Přístup pouze pro administrátory.")
        : NextResponse.redirect(new URL("/prehled", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
}
