import type { NextRequest } from "next/server"

import { env } from "@/env.mjs"

function trimSlash(v: string) {
  return v.replace(/\/$/, "")
}

export function getAppBaseUrl(req?: NextRequest): string {
  if (req) {
    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    const proto =
      req.headers.get("x-forwarded-proto") ??
      req.nextUrl.protocol.replace(":", "")

    if (host) {
      return trimSlash(`${proto}://${host}`)
    }

    if (req.nextUrl?.origin) {
      return trimSlash(req.nextUrl.origin)
    }
  }

  return trimSlash(env.NEXT_PUBLIC_APP_URL)
}

export function absoluteUrl(path: string, req?: NextRequest): string {
  const base = getAppBaseUrl(req)
  const p = path.startsWith("/") ? path : `/${path}`
  return `${base}${p}`
}
