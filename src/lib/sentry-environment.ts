export function getSentryEnvironment(): string {
  const explicit =
    process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT

  if (explicit) return explicit

  const nodeEnv = process.env.NODE_ENV ?? "development"

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase()

    if (
      host === "localhost" ||
      host.startsWith("localhost:") ||
      host === "127.0.0.1"
    ) {
      return "local"
    }

    if (host === "onboard.kitt6.dev") {
      return "development"
    }

    if (host === "onboarding.praha6.cz") {
      return "production"
    }

    return nodeEnv
  }

  return nodeEnv
}

export function isSentryEnabled(environment: string): boolean {
  if (process.env.SENTRY_ENABLED === "false") return false

  if (environment === "local") return false

  return true
}
