declare module "@/env.mjs" {
  export const env: {
    NODE_ENV: "development" | "production" | "test"
    NEXT_PUBLIC_APP_URL: string

    DATABASE_URL: string
    AUTH_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string

    RESEND_API_KEY: string
    RESEND_EMAIL_FROM: string
    RESEND_EMAIL_TO: string
    RESEND_USERNAME: string

    REPORT_RECIPIENTS_PLANNED?: string
    REPORT_RECIPIENTS_ACTUAL?: string

    EOS_API_BASE?: string
    EOS_API_TOKEN?: string
  }
}
