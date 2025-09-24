import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    DATABASE_URL: z.string(),
    AUTH_SECRET: z.string(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),

    RESEND_API_KEY: z.string(),
    RESEND_EMAIL_FROM: z.string().email(),
    RESEND_EMAIL_TO: z.string().email(),
    RESEND_USERNAME: z.string(),

    REPORT_RECIPIENTS_PLANNED: z.string().optional(),
    REPORT_RECIPIENTS_ACTUAL: z.string().optional(),

    EOS_API_BASE: z.string().url().optional(),
    EOS_API_TOKEN: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,

    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,

    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_EMAIL_FROM: process.env.RESEND_EMAIL_FROM,
    RESEND_EMAIL_TO: process.env.RESEND_EMAIL_TO,
    RESEND_USERNAME: process.env.RESEND_USERNAME,

    REPORT_RECIPIENTS_PLANNED: process.env.REPORT_RECIPIENTS_PLANNED,
    REPORT_RECIPIENTS_ACTUAL: process.env.REPORT_RECIPIENTS_ACTUAL,

    EOS_API_BASE: process.env.EOS_API_BASE,
    EOS_API_TOKEN: process.env.EOS_API_TOKEN,
  },
})
