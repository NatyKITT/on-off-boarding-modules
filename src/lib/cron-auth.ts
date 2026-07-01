import { NextRequest, NextResponse } from "next/server"

export function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()

  if (!secret) {
    return false
  }

  const authHeader = req.headers.get("authorization")?.trim()
  const cronSecretHeader = req.headers.get("x-cron-secret")?.trim()

  return authHeader === `Bearer ${secret}` || cronSecretHeader === secret
}

export function requireCronAuthorization(req: NextRequest) {
  if (isCronAuthorized(req)) {
    return null
  }

  return NextResponse.json(
    {
      status: "error",
      message: "Unauthorized cron request.",
    },
    { status: 401 }
  )
}
