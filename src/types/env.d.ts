declare module "@/env.mjs" {
  export const env: {
    NODE_ENV: "localhost" | "development" | "production"
    NEXT_PUBLIC_APP_URL: string

    DATABASE_URL: string
    AUTH_SECRET: string
    AUTH_URL: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string

    RESEND_API_KEY?: string
    RESEND_EMAIL_FROM?: string
    RESEND_USERNAME?: string

    REPORT_RECIPIENTS_PLANNED?: string
    REPORT_RECIPIENTS_ACTUAL?: string
    REPORT_RECIPIENTS_ALL?: string

    HR_NOTIFICATION_EMAILS?: string
    PAYROLL_NOTIFICATION_EMAILS?: string
    SUPER_ADMIN_EMAILS?: string
    HR_EMAILS?: string
    IT_EMAILS?: string
    READONLY_EMAILS?: string

    SENTRY_ENVIRONMENT?: string
    SENTRY_ENABLED?: "true" | "false"

    EOS_API_BASE?: string
    EOS_API_TOKEN?: string
  }
}
