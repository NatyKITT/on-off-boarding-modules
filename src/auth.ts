import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import { getUserById } from "@/lib/user"

const ALLOWED_DOMAINS = new Set(["kitt6.cz", "praha6.cz"])

const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h
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
        if (email.endsWith("@kitt6.cz")) {
          await prisma.user.update({
            where: { id: user.id as string },
            data: { role: "ADMIN" },
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
      if (pathname.startsWith("/signin")) return true
      return !!auth
    },

    async signIn({ profile }) {
      const email = profile?.email ?? ""
      const domain = email.split("@")[1]?.toLowerCase() ?? ""
      return ALLOWED_DOMAINS.has(domain)
    },

    async jwt({ token, user, profile }) {
      if (user && "id" in user) token.id = String(user.id)

      const email =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" && user.email) ||
        (typeof profile?.email === "string" && profile.email) ||
        null

      if (!token.role && token.sub) {
        const dbUser = await getUserById(token.sub)
        if (dbUser?.role) token.role = dbUser.role as Role
      }

      if (email && email.toLowerCase().endsWith("@kitt6.cz")) {
        token.role = "ADMIN"
      }

      if (!token.role) token.role = "USER"

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id)
        session.user.role = token.role as Role
      }
      return session
    },
  },

  debug: process.env.NODE_ENV === "development",
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
