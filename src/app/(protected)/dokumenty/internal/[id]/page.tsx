import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

import { InternalDocumentShell } from "./internal-document-shell"

type PageProps = {
  params: { id: string }
}

export default async function InternalDocumentPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) {
    redirect("/signin")
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    notFound()
  }

  const doc = await prisma.employmentDocument.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      status: true,
      isLocked: true,
      data: true,
      createdAt: true,
      completedAt: true,
      onboarding: {
        select: {
          id: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          department: true,
          unitName: true,
          positionName: true,
        },
      },
    },
  })

  if (!doc) {
    notFound()
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
        <InternalDocumentShell document={doc} />
      </div>
    </main>
  )
}
