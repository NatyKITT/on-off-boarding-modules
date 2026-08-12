import * as React from "react"
import { useSession } from "next-auth/react"

export function useSignatureName() {
  const { data: session } = useSession()
  const fallback = session?.user?.name ?? ""

  const [signatureName, setSignatureName] = React.useState(fallback)

  React.useEffect(() => {
    if (!session?.user?.email) return

    let cancelled = false

    void (async () => {
      try {
        const res = await fetch("/api/me/signature-name", {
          cache: "no-store",
        })

        if (!res.ok) return

        const json = (await res.json()) as { name?: string }

        if (!cancelled && json.name) {
          setSignatureName(json.name)
        }
      } catch {
        return
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session?.user?.email])

  return signatureName || fallback
}
