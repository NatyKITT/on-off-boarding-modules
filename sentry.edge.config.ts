import * as Sentry from "@sentry/nextjs"

import { getSentryEnvironment, isSentryEnabled } from "@/lib/sentry-environment"

const environment = getSentryEnvironment()
const enabled = isSentryEnabled(environment)

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",

  environment,
  enabled,

  tracesSampleRate: environment === "production" ? 0.2 : 1.0,
  enableLogs: enabled && environment !== "production",

  sendDefaultPii: false,
})
