import { Users } from "lucide-react"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"

export default function InfoCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
        <Users className="size-4 text-muted-foreground" />
      </CardHeader>
    </Card>
  )
}
