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

export default auth((req) => {
  const session = req.auth as SessionWithUser | null
  const path = req.nextUrl.pathname

  const publicPaths = ["/signin", "/terms", "/privacy"]
  const isPublicPath = publicPaths.some((p) => path.startsWith(p))

  const isAuthPath = path.startsWith("/api/auth")

  const isPublicDocumentPage =
    path.startsWith("/dokumenty/") && !path.startsWith("/dokumenty/internal")

  const isPublicDocumentApi = path.startsWith("/api/dokumenty/public")

  if (
    isPublicPath ||
    isAuthPath ||
    isPublicDocumentPage ||
    isPublicDocumentApi
  ) {
    return NextResponse.next()
  }

  if (!session) {
    const signInUrl = new URL("/signin", req.url)

    const callbackUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`
    signInUrl.searchParams.set("callbackUrl", callbackUrl)

    return NextResponse.redirect(signInUrl)
  }

  if (path === "/") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }

  const userRole = session.user?.role

  if (path.startsWith("/admin") && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }
  if (path.startsWith("/hr") && userRole !== "HR" && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }
  if (path.startsWith("/it") && userRole !== "IT" && userRole !== "ADMIN") {
    return NextResponse.redirect(new URL("/prehled", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|assets|.*\\.(png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
}
