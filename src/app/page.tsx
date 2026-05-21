import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

type HomePageProps = {
  searchParams?: {
    login?: string | string[]
    logout?: string | string[]
  }
}

function getSearchParamValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0]
  return value
}

function getDefaultRedirectByRole(role?: string | null) {
  if (role === "ADMIN") return "/admin"
  if (role === "HR" || role === "IT" || role === "READONLY") return "/prehled"

  return "/no-access"
}

function appendAuthStatus(
  url: string,
  searchParams?: HomePageProps["searchParams"]
) {
  const login = getSearchParamValue(searchParams?.login)
  const logout = getSearchParamValue(searchParams?.logout)

  const params = new URLSearchParams()

  if (login === "success") params.set("login", "success")
  if (logout === "success") params.set("logout", "success")

  const query = params.toString()

  return query ? `${url}?${query}` : url
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/signin")
  }

  redirect(appendAuthStatus(getDefaultRedirectByRole(user.role), searchParams))
}
