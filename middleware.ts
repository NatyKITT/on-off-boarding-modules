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

function isPraha6OrKitt6(email?: string | null) {
  const d = getDomain(email)
  return d === "praha6.cz" || d === "kitt6.cz"
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

  if (publicPaths.some((p) => path.startsWith(p))) {
    return NextResponse.next()
  }

  if (!session?.user) {
    if (isApi) return jsonError(401, "Nejste přihlášen(a).")
    const signInUrl = new URL("/signin", req.url)
    signInUrl.searchParams.set(
      "callbackUrl",
      `${req.nextUrl.pathname}${req.nextUrl.search}`
    )
    return NextResponse.redirect(signInUrl)
  }

  const email = session.user.email ?? null
  const role = (session.user.role ?? "USER") as Role
  const canAccessApp = Boolean(session.user.canAccessApp)

  if (path === "/") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }

  const isPublicExitPage = path.startsWith("/odchody-public/")
  const isPublicExitApi = path.startsWith("/api/odchody/public/")

  if (isPublicExitPage || isPublicExitApi) {
    if (!isPraha6OrKitt6(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro zaměstnance ÚMČ Praha 6.")
        : NextResponse.redirect(new URL("/no-access", req.url))
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
        : NextResponse.redirect(new URL("/no-access", req.url))
    }

    if (role === "USER" && /\/invite/.test(path)) {
      return jsonError(403, "Nemáte oprávnění odesílat pozvánky k podpisu.")
    }

    return NextResponse.next()
  }

  if (role === "USER") {
    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : NextResponse.redirect(new URL("/no-access", req.url))
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
    return NextResponse.next()
  }

  if (role === "READONLY" && isApi && isMutatingMethod(method)) {
    if (isInternalExitApi || isPublicExitApi) {
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
