import { NextResponse } from "next/server"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"
import type { Session } from "next-auth"

type SessionWithRole = Session & { user: { role?: Role } }

export default auth((req) => {
  const session = req.auth as SessionWithRole | null
  const path = req.nextUrl.pathname

  const publicPaths = ["/signin", "/terms", "/privacy"]
  const isPublicPath = publicPaths.some((p) => path.startsWith(p))
  const isAuthPath = path.startsWith("/api/auth")
  if (isPublicPath || isAuthPath) return NextResponse.next()

  if (!session) {
    const signInUrl = new URL("/signin", req.url)
    signInUrl.searchParams.set("callbackUrl", path)
    return NextResponse.redirect(signInUrl)
  }

  if (path === "/" && !session) {
    return NextResponse.redirect(new URL("/signin", req.url))
  }

  if (path === "/" && session) {
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
