import { AlertCircle } from "lucide-react"

import { prisma } from "@/lib/db"
import { buildEmployeeMeta } from "@/lib/employee-meta"

import { PublicDocumentShell } from "./public-document-shell"

type PageProps = { params: { hash: string } }

export default async function PublicDocumentPage({ params }: PageProps) {
  const { hash } = params

  const doc = await prisma.employmentDocument.findUnique({
    where: { accessHash: hash },
    select: {
      id: true,
      type: true,
      status: true,
      expiresAt: true,
      onboarding: {
        select: {
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

  const isExpired = !!doc?.expiresAt && doc.expiresAt < new Date()
  const isInvalid = !doc || doc.status !== "DRAFT" || isExpired

  if (isInvalid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="mb-4 size-12 text-red-500" />
        <h1 className="text-2xl font-bold">Odkaz není platný</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Dokument buď neexistuje, jeho platnost již vypršela, nebo byl již
          vyplněn.
        </p>
      </div>
    )
  }

  const employeeMeta = doc.onboarding
    ? buildEmployeeMeta(doc.onboarding)
    : undefined

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
        <PublicDocumentShell
          documentId={doc.id}
          hash={hash}
          type={doc.type}
          employeeMeta={employeeMeta}
        />
      </div>
    </main>
  )
}
