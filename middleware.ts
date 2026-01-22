import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"
import type { Session } from "next-auth"

import { hasPerm, type Permission } from "@/lib/rbac"

type SessionUser = {
  id: string
  role?: Role
  canAccessApp?: boolean
  email?: string | null
}

type SessionWithUser = Session & { user: SessionUser }

const INTERNAL_ROLES: Role[] = ["ADMIN", "HR", "IT", "READONLY"]

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

function requiredPermForPath(path: string, method: string): Permission | null {
  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    return "ADMIN_ACCESS"
  }
  if (path.startsWith("/api/users")) {
    return "USERS_MANAGE"
  }

  if (path.startsWith("/prehled") || path.startsWith("/api/prehled")) {
    return "ONBOARDING_READ"
  }

  if (
    path.startsWith("/nastupy") ||
    path.startsWith("/api/nastupy") ||
    path.startsWith("/dokumenty/internal") ||
    path.startsWith("/api/dokumenty/internal") ||
    path.startsWith("/api/dokumenty/assign") ||
    path.startsWith("/api/dokumenty/send-link")
  ) {
    return isMutatingMethod(method) ? "ONBOARDING_WRITE" : "ONBOARDING_READ"
  }

  if (path.startsWith("/odchody") || path.startsWith("/api/odchody")) {
    if (path.includes("/exit-checklist")) {
      return isMutatingMethod(method)
        ? "EXIT_CHECKLIST_SIGN"
        : "EXIT_CHECKLIST_READ"
    }

    return isMutatingMethod(method) ? "OFFBOARDING_WRITE" : "OFFBOARDING_READ"
  }

  return null
}

export default auth((req) => {
  const session = req.auth as SessionWithUser | null
  const path = req.nextUrl.pathname
  const method = req.method
  const isApi = path.startsWith("/api")
  const publicPaths = ["/signin", "/terms", "/privacy"]
  const isPublicPath = publicPaths.some((p) => path.startsWith(p))
  const isAuthPath = path.startsWith("/api/auth")
  const isHealthPath = path.startsWith("/api/health")
  const isPublicDocumentPage =
    path.startsWith("/dokumenty/") && !path.startsWith("/dokumenty/internal")
  const isPublicDocumentApi = path.startsWith("/api/dokumenty/public")

  if (
    isPublicPath ||
    isAuthPath ||
    isHealthPath ||
    isPublicDocumentPage ||
    isPublicDocumentApi
  ) {
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

  const isPublicExitPage = path.startsWith("/public/exit")
  const isPublicExitApi = path.startsWith("/api/public/exit")

  if (isPublicExitPage || isPublicExitApi) {
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

  const isInternal = INTERNAL_ROLES.includes(role)

  if (!isInternal && !canAccessApp) {
    return isApi
      ? jsonError(403, "Nemáte přístup do aplikace.")
      : NextResponse.redirect(new URL("/no-access", req.url))
  }

  const required = requiredPermForPath(path, method)
  if (required && !hasPerm(role, required)) {
    return isApi
      ? jsonError(403, "Nemáte oprávnění pro tuto akci.")
      : NextResponse.redirect(new URL("/prehled", req.url))
  }

  if (role === "READONLY" && isApi && isMutatingMethod(method)) {
    return jsonError(403, "Máte pouze režim pro čtení (read-only).")
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
}
