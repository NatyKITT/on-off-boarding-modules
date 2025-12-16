import * as Sentry from "@sentry/nextjs"

import { getSentryEnvironment, isSentryEnabled } from "@/lib/sentry-environment"

const environment = getSentryEnvironment()
const enabled = isSentryEnabled(environment)

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment,
  enabled,

  integrations: [Sentry.replayIntegration()],

  tracesSampleRate: environment === "production" ? 0.2 : 1.0,

  enableLogs: enabled && environment !== "production",

  replaysSessionSampleRate: environment === "production" ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,

  sendDefaultPii: true,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
