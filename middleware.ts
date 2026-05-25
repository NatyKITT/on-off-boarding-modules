import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"
import type { Session } from "next-auth"

import { canAccessInternalApp } from "@/lib/rbac"

type SessionUser = {
  id: string
  role?: Role
  canAccessApp?: boolean
  email?: string | null
}

type SessionWithUser = Session & { user: SessionUser }

type MiddlewareRequest = {
  url: string
  nextUrl: URL
  method: string
}

function getDomain(email?: string | null) {
  return (email ?? "").split("@")[1]?.toLowerCase() ?? ""
}

function isPraha6OrKitt6(email?: string | null) {
  const domain = getDomain(email)
  return domain === "praha6.cz" || domain === "kitt6.cz"
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

function redirectWithCurrentSearch(req: MiddlewareRequest, pathname: string) {
  const url = new URL(pathname, req.url)
  url.search = req.nextUrl.search
  return NextResponse.redirect(url)
}

function redirectToSignIn(req: MiddlewareRequest) {
  const signInUrl = new URL("/signin", req.url)

  signInUrl.searchParams.set(
    "callbackUrl",
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  )

  return NextResponse.redirect(signInUrl)
}

export default auth((req) => {
  const request = req as MiddlewareRequest
  const session = req.auth as SessionWithUser | null

  const path = req.nextUrl.pathname
  const method = req.method
  const isApi = path.startsWith("/api")

  const publicPaths = [
    "/signin",
    "/no-access",
    "/terms",
    "/privacy",
    "/api/auth",
    "/api/health",
  ]

  if (publicPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  if (!session?.user) {
    if (isApi) {
      return jsonError(401, "Nejste přihlášen(a).")
    }

    return redirectToSignIn(request)
  }

  const email = session.user.email ?? null
  const role = (session.user.role ?? "USER") as Role
  const canAccessApp = Boolean(session.user.canAccessApp)

  const isPublicExitPage = path.startsWith("/odchody-public/")
  const isPublicExitApi = path.startsWith("/api/odchody/public/")

  if (isPublicExitPage || isPublicExitApi) {
    if (!isPraha6OrKitt6(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro zaměstnance ÚMČ Praha 6.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    return NextResponse.next()
  }

  const isInternalExitPage = /^\/odchody\/\d+\/vystupni-list(\/.*)?$/.test(path)
  const isInternalExitApi = /^\/api\/odchody\/\d+\/exit-checklist(\/.*)?$/.test(
    path
  )

  if (isInternalExitPage || isInternalExitApi) {
    if (!isPraha6OrKitt6(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro zaměstnance ÚMČ Praha 6.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    if (!canAccessInternalApp(role)) {
      return isApi
        ? jsonError(403, "K internímu výstupnímu listu nemáte přístup.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    return NextResponse.next()
  }

  if (role === "USER") {
    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : redirectWithCurrentSearch(request, "/no-access")
  }

  if (!canAccessApp && !canAccessInternalApp(role)) {
    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : redirectWithCurrentSearch(request, "/no-access")
  }

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    if (role !== "ADMIN") {
      return isApi
        ? jsonError(403, "Přístup pouze pro administrátory.")
        : redirectWithCurrentSearch(request, "/prehled")
    }

    return NextResponse.next()
  }

  if (role === "READONLY" && isApi && isMutatingMethod(method)) {
    if (isPublicExitApi || isInternalExitApi) {
      return NextResponse.next()
    }

    return jsonError(
      403,
      "Máte pouze režim pro čtení. Pro úpravy kontaktujte administrátora."
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
}
