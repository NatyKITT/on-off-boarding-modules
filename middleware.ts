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
    const callbackUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`
    signInUrl.searchParams.set("callbackUrl", callbackUrl)
    return NextResponse.redirect(signInUrl)
  }

  const email = session.user.email ?? null
  const role = (session.user.role ?? "USER") as Role
  const canAccessApp = Boolean(session.user.canAccessApp)

  const isPublicExit =
    path.startsWith("/public/exit") || path.startsWith("/api/public/exit")

  if (isPublicExit) {
    if (!isPraha6(email)) {
      return isApi
        ? jsonError(403, "Nemáte oprávnění k podpisové části.")
        : NextResponse.redirect(new URL("/prehled", req.url))
    }
    return NextResponse.next()
  }

  if (path === "/") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }

  if (role === "USER" || !canAccessApp) {
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
    if (path.startsWith("/api/public/exit")) {
      return NextResponse.next()
    }

    return jsonError(403, "Máte pouze režim pro čtení (read-only).")
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
}
