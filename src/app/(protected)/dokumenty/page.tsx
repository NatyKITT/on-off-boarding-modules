import { requireInternalEditor } from "@/lib/session"

import { DocumentsOverviewClient } from "./documents-overview-client"

export default async function DokumentyPage() {
  await requireInternalEditor()

  return <DocumentsOverviewClient />
}
