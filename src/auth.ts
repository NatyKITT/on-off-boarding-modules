import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"

const isProd = process.env.NODE_ENV === "production"

const DEV_ALLOWED_DOMAINS = ["kitt6.cz", "praha6.cz"] as const
const PROD_ALLOWED_DOMAINS = ["kitt6.cz", "praha6.cz"] as const

const ALLOWED_DOMAINS: ReadonlySet<string> = new Set(
  isProd ? PROD_ALLOWED_DOMAINS : DEV_ALLOWED_DOMAINS
)

function parseEmails(envValue: string | undefined): ReadonlySet<string> {
  return new Set(
    (envValue ?? "")
      .split(/[;,]/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  )
}

const SUPER_ADMIN_EMAILS = parseEmails(process.env.SUPER_ADMIN_EMAILS)
const HR_EMAILS = parseEmails(process.env.HR_EMAILS)
const IT_EMAILS = parseEmails(process.env.IT_EMAILS)
const READONLY_EMAILS = parseEmails(process.env.READONLY_EMAILS)

function getDomain(email: string | null | undefined): string {
  if (!email) return ""
  return email.split("@")[1]?.toLowerCase() ?? ""
}

function isInternalRole(role: Role | null | undefined): boolean {
  return (
    role === "ADMIN" || role === "HR" || role === "IT" || role === "READONLY"
  )
}

function getEnvRoleForEmail(email: string): Role | null {
  const lower = email.toLowerCase()

  if (SUPER_ADMIN_EMAILS.has(lower)) return "ADMIN"
  if (HR_EMAILS.has(lower)) return "HR"
  if (IT_EMAILS.has(lower)) return "IT"
  if (READONLY_EMAILS.has(lower)) return "READONLY"

  return null
}

function getDefaultRoleForEmail(email: string): Role {
  const domain = getDomain(email)

  if (domain === "kitt6.cz") {
    return "IT"
  }

  return "USER"
}

function getRoleForEmail(email: string): Role {
  return getEnvRoleForEmail(email) ?? getDefaultRoleForEmail(email)
}

function canEmailSignIn(email: string | null | undefined): boolean {
  const domain = getDomain(email)
  return ALLOWED_DOMAINS.has(domain)
}

async function syncUserAccess(userId: string, email: string) {
  const normalizedEmail = email.toLowerCase()
  const nextRole = getRoleForEmail(normalizedEmail)
  const nextCanAccessApp = isInternalRole(nextRole)

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      canAccessApp: true,
      name: true,
      surname: true,
    },
  })

  if (!dbUser) return null

  if (dbUser.role !== nextRole || dbUser.canAccessApp !== nextCanAccessApp) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: nextRole,
        canAccessApp: nextCanAccessApp,
      },
    })
  }

  return {
    ...dbUser,
    role: nextRole,
    canAccessApp: nextCanAccessApp,
  }
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
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

  callbacks: {
    authorized() {
      return true
    },

    async signIn({ profile }) {
      return canEmailSignIn(profile?.email)
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`

      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url
      } catch {}

      return baseUrl
    },

    async jwt({ token, user, profile }) {
      const email =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" && user.email) ||
        (typeof profile?.email === "string" && profile.email) ||
        null

      if (email) {
        token.email = email.toLowerCase()
      }

      const userId =
        user && "id" in user
          ? String(user.id)
          : token.sub
            ? String(token.sub)
            : null

      if (userId) {
        token.id = userId
      }

      if (user?.name && !token.name) {
        token.name = user.name
      }

      if (userId && token.email) {
        const dbUser = await syncUserAccess(userId, String(token.email))

        if (dbUser) {
          token.role = dbUser.role
          token.canAccessApp = dbUser.canAccessApp

          if (!token.name && (dbUser.name || dbUser.surname)) {
            token.name = [dbUser.name, dbUser.surname].filter(Boolean).join(" ")
          }
        }
      }

      if (!token.role) {
        token.role = "USER"
      }

      if (typeof token.canAccessApp === "undefined") {
        token.canAccessApp = false
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "")
        session.user.email =
          (token.email as string | null) ?? session.user.email
        session.user.role = token.role as Role
        session.user.canAccessApp = Boolean(token.canAccessApp)

        if (token.name) {
          session.user.name = token.name as string
        }
      }

      return session
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
