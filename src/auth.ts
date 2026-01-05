import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import { getUserById } from "@/lib/user"

const isProd = process.env.NODE_ENV === "production"

const DEV_ALLOWED_DOMAINS = ["kitt6.cz", "praha6.cz"] as const
const PROD_ALLOWED_DOMAINS = ["praha6.cz"] as const

const ALLOWED_DOMAINS: ReadonlySet<string> = new Set<string>(
  isProd ? PROD_ALLOWED_DOMAINS : DEV_ALLOWED_DOMAINS
)

const ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.REPORT_RECIPIENTS_PLANNED ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

type AuthUserWithFlags = {
  id: string
  role: Role
  email?: string | null
  name?: string | null
  image?: string | null
  canAccessApp?: boolean | null
}

function getDomain(email: string | null | undefined): string {
  if (!email) return ""
  return email.split("@")[1]?.toLowerCase() ?? ""
}

function isPraha6(email: string | null | undefined): boolean {
  return getDomain(email) === "praha6.cz"
}

function isKitt6(email: string | null | undefined): boolean {
  return getDomain(email) === "kitt6.cz"
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 0,
  },

  trustHost: true,
  secret: env.AUTH_SECRET,

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  events: {
    async signIn({ user }) {
      try {
        const email = user.email?.toLowerCase() ?? ""

        if (email.endsWith("@kitt6.cz") || ADMIN_EMAILS.has(email)) {
          await prisma.user.update({
            where: { id: user.id as string },
            data: { role: "ADMIN", canAccessApp: true },
          })
        }
      } catch (e) {
        console.warn("signIn role sync (non-fatal):", e)
      }
    },
  },

  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl

      if (pathname.startsWith("/signin") || pathname.startsWith("/api/auth")) {
        return true
      }

      if (!auth?.user) return false

      const user = auth.user as AuthUserWithFlags

      const email = user.email ?? null
      const canAccessApp = user.canAccessApp ?? false

      if (user.role === "ADMIN") {
        return true
      }

      if (pathname.startsWith("/public/exit")) {
        return isPraha6(email)
      }

      if (!isProd && isKitt6(email)) {
        return true
      }

      return Boolean(canAccessApp)
    },

    async signIn({ profile }) {
      const email = profile?.email ?? ""
      const domain = getDomain(email)

      return ALLOWED_DOMAINS.has(domain)
    },

    async jwt({ token, user, profile }) {
      if (user && "id" in user) {
        token.id = String(user.id)
      }

      const email =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" && user.email) ||
        (typeof profile?.email === "string" && profile.email) ||
        null

      if (email) {
        token.email = email
      }

      if (
        (!token.role || typeof token.canAccessApp === "undefined") &&
        token.sub
      ) {
        const dbUser = await getUserById(token.sub)
        if (dbUser) {
          token.role = dbUser.role as Role
          token.canAccessApp = dbUser.canAccessApp ?? false
        }
      }

      if (email && ADMIN_EMAILS.has(email.toLowerCase())) {
        token.role = "ADMIN"
        token.canAccessApp = true
      }

      if (email && isKitt6(email)) {
        token.role = "ADMIN"
        token.canAccessApp = true
      }

      if (!token.role) token.role = "USER"
      if (typeof token.canAccessApp === "undefined") {
        token.canAccessApp = false
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id)
        session.user.email = token.email ?? session.user.email
        session.user.role = token.role as Role
        session.user.canAccessApp = Boolean(token.canAccessApp)
      }
      return session
    },
  },

  debug: process.env.NODE_ENV === "development",
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
