import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "localhost", "production"]),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),

    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),

    RESEND_API_KEY: z.string().optional(),
    RESEND_EMAIL_FROM: z.string().email().optional(),

    REPORT_RECIPIENTS_PLANNED: z.string().optional(),
    REPORT_RECIPIENTS_ACTUAL: z.string().optional(),
    REPORT_RECIPIENTS_ALL: z.string().optional(),
    HR_NOTIFICATION_EMAILS: z.string().optional(),

    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_ENABLED: z.enum(["true", "false"]).optional(),

    EOS_API_BASE: z.string().url().optional(),
    EOS_API_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL_FROM: process.env.RESEND_EMAIL_FROM,

    REPORT_RECIPIENTS_PLANNED: process.env.REPORT_RECIPIENTS_PLANNED,
    REPORT_RECIPIENTS_ACTUAL: process.env.REPORT_RECIPIENTS_ACTUAL,
    REPORT_RECIPIENTS_ALL: process.env.REPORT_RECIPIENTS_ALL,
    HR_NOTIFICATION_EMAILS: process.env.HR_NOTIFICATION_EMAILS,

    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_ENABLED: process.env.SENTRY_ENABLED,

    EOS_API_BASE: process.env.EOS_API_BASE,
    EOS_API_TOKEN: process.env.EOS_API_TOKEN,
  },
})
