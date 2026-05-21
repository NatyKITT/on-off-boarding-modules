import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { UserRoleManagement } from "@/components/forms/user-role-management"

type AdminPageProps = {
  searchParams?: {
    login?: string | string[]
    logout?: string | string[]
  }
}

function getSearchParamValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0]
  return value
}

function appendAuthStatus(
  url: string,
  searchParams?: AdminPageProps["searchParams"]
) {
  const login = getSearchParamValue(searchParams?.login)
  const logout = getSearchParamValue(searchParams?.logout)

  const params = new URLSearchParams()

  if (login === "success") params.set("login", "success")
  if (logout === "success") params.set("logout", "success")

  const query = params.toString()

  return query ? `${url}?${query}` : url
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/signin")
  }

  if (user.role !== "ADMIN") {
    redirect(appendAuthStatus("/prehled", searchParams))
  }

  return (
    <>
      <DashboardHeader
        heading="Administrace"
        text="Správa uživatelských rolí a oprávnění."
      />
      <div className="flex flex-col gap-5">
        <UserRoleManagement />
      </div>
    </>
  )
}
