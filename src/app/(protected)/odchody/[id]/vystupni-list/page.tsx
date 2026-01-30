import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { getSession } from "@/lib/session"

import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = { params: { id: string } }

export default async function ExitChecklistPage({ params }: Props) {
  const session = await getSession()
  if (!session?.user) {
    notFound()
  }

  const offId = Number(params.id)
  if (Number.isNaN(offId)) {
    notFound()
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"

  const cookieHeader = cookies().toString()

  const res = await fetch(`${base}/api/odchody/${offId}/exit-checklist`, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader,
    },
  })

  if (!res.ok) {
    notFound()
  }

  const json = (await res.json()) as {
    status?: string
    data?: ExitChecklistData
  }

  if (!json.data) {
    notFound()
  }

  const data = json.data

  const role = session.user.role
  const isAdmin = role === "ADMIN" || role === "HR" || role === "IT"

  if (data.lockedAt && !isAdmin) {
    redirect(`/api/odchody/${offId}/vystupni-list`)
  }

  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8"
      data-lenis-prevent="true"
      data-lenis-prevent-wheel="true"
    >
      <ExitChecklistForm offboardingId={offId} initialData={data} />
    </div>
  )
}
