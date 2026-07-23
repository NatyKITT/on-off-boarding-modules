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

type SessionWithUser = Session & {
  user: SessionUser
}

type MiddlewareRequest = {
  url: string
  nextUrl: URL
  method: string
}

const DEFAULT_ALLOWED_EMPLOYEE_DOMAINS = ["praha6.cz", "kitt6.cz"] as const

function getAllowedEmployeeDomains() {
  const fromEnv = process.env.ALLOWED_EMPLOYEE_DOMAINS?.trim()

  if (!fromEnv) {
    return [...DEFAULT_ALLOWED_EMPLOYEE_DOMAINS]
  }

  return fromEnv
    .split(/[;,]/)
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

function getDomain(email?: string | null) {
  return (email ?? "").split("@")[1]?.toLowerCase() ?? ""
}

function isAllowedEmployeeEmail(email?: string | null) {
  const domain = getDomain(email)

  if (!domain) {
    return false
  }

  return getAllowedEmployeeDomains().includes(domain)
}

function jsonError(status: number, message: string) {
  return new NextResponse(JSON.stringify({ status: "error", message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
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

function isAuthorizedCronRequest(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret) {
    return false
  }

  const authHeader = req.headers.get("authorization")?.trim()
  const cronSecretHeader = req.headers.get("x-cron-secret")?.trim()

  return authHeader === `Bearer ${secret}` || cronSecretHeader === secret
}

function isBasicPublicPath(path: string) {
  const publicPaths = [
    "/signin",
    "/no-access",
    "/terms",
    "/privacy",
    "/api/auth",
    "/api/health",
  ]

  return publicPaths.some((publicPath) => {
    return path === publicPath || path.startsWith(`${publicPath}/`)
  })
}

function isPublicEmploymentDocumentPath(path: string) {
  const isInternalDocumentPath =
    path === "/dokumenty/internal" || path.startsWith("/dokumenty/internal/")

  return (
    path === "/dokumenty" ||
    (path.startsWith("/dokumenty/") && !isInternalDocumentPath) ||
    path === "/api/dokumenty/public" ||
    path.startsWith("/api/dokumenty/public/")
  )
}

function isPublicProbationEvaluationPath(path: string) {
  const isPublicPage =
    path === "/vyhodnoceni-zkusebni-doby" ||
    path.startsWith("/vyhodnoceni-zkusebni-doby/")

  const isPublicApi =
    path === "/api/nastupy/public" || path.startsWith("/api/nastupy/public/")

  return isPublicPage || isPublicApi
}

function isPublicExitPath(path: string) {
  return (
    path === "/odchody-public" ||
    path.startsWith("/odchody-public/") ||
    path === "/api/odchody/public" ||
    path.startsWith("/api/odchody/public/")
  )
}

function isInternalExitPath(path: string) {
  const isInternalExitPage = /^\/odchody\/\d+\/vystupni-list(\/.*)?$/.test(path)
  const isInternalExitApi = /^\/api\/odchody\/\d+\/exit-checklist(\/.*)?$/.test(
    path
  )

  return isInternalExitPage || isInternalExitApi
}

function isReadonlyAllowedMutatingApi(path: string) {
  return (
    path === "/api/user/vyresit" ||
    path.startsWith("/api/odchody/public/") ||
    path.startsWith("/api/nastupy/public/") ||
    /^\/api\/odchody\/\d+\/exit-checklist(\/.*)?$/.test(path) ||
    path === "/api/statistiky/pdf" ||
    path === "/api/reporty/pdf"
  )
}

export default auth((req) => {
  const request = req as MiddlewareRequest
  const session = req.auth as SessionWithUser | null

  const path = req.nextUrl.pathname
  const method = req.method

  const isApi = path.startsWith("/api")
  const isMutatingApi = isApi && isMutatingMethod(method)

  if (isBasicPublicPath(path) || isPublicEmploymentDocumentPath(path)) {
    return NextResponse.next()
  }

  const isCronApi = path === "/api/cron" || path.startsWith("/api/cron/")

  if (isCronApi) {
    if (!isAuthorizedCronRequest(req)) {
      return jsonError(401, "Unauthorized cron request.")
    }

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

  if (isPublicProbationEvaluationPath(path)) {
    if (!isAllowedEmployeeEmail(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro povolené firemní účty.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    return NextResponse.next()
  }

  if (isPublicExitPath(path)) {
    if (!isAllowedEmployeeEmail(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro povolené firemní účty.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    return NextResponse.next()
  }

  if (isInternalExitPath(path)) {
    if (!isAllowedEmployeeEmail(email)) {
      return isApi
        ? jsonError(403, "Přístup pouze pro povolené firemní účty.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    if (!canAccessInternalApp(role)) {
      return isApi
        ? jsonError(403, "K internímu výstupnímu listu nemáte přístup.")
        : redirectWithCurrentSearch(request, "/no-access")
    }

    return NextResponse.next()
  }

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    if (role !== "ADMIN") {
      return isApi
        ? jsonError(403, "Přístup pouze pro administrátory.")
        : redirectWithCurrentSearch(request, "/prehled")
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

  if (
    role === "READONLY" &&
    isMutatingApi &&
    !isReadonlyAllowedMutatingApi(path)
  ) {
    return jsonError(
      403,
      "Máte pouze režim pro čtení. Pro úpravy kontaktujte administrátora."
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp|pdf)).*)",
  ],
}
