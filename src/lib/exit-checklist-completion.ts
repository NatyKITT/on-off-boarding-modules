import type { ExitChecklistData } from "@/types/exit-checklist"

export function getExitChecklistCompletionState(data: ExitChecklistData) {
  const requiredItems = data.items.filter((item) => {
    if (item.key === "lawInfo" && !data.conflictOfInterest) return false
    return true
  })

  const resolvedSignedCount = requiredItems.filter(
    (item) => item.resolved !== null && Boolean(item.signedAt)
  ).length

  const rowsComplete = requiredItems.every(
    (item) => item.resolved !== null && Boolean(item.signedAt)
  )
  const rowsFraction =
    requiredItems.length > 0 ? resolvedSignedCount / requiredItems.length : 1

  const headerComplete = Boolean(
    data.signatures?.employee?.signedAt &&
      data.signatures?.manager?.signedAt &&
      data.signatures?.issuer?.signedAt
  )

  const option2Complete =
    !data.handover?.option2 ||
    Boolean(
      data.handover.option2Target?.trim() ||
        data.handover.option2TargetPositionNum?.trim()
    )

  const option3Complete =
    !data.handover?.option3 || Boolean(data.handover.option3Reason?.trim())

  const handoverChoiceMade = Boolean(
    data.handover?.option1 ||
      (data.handover?.option2 && option2Complete) ||
      (data.handover?.option3 && option3Complete)
  )

  const handoverComplete =
    handoverChoiceMade && Boolean(data.handoverManagerSignature?.signedAt)

  const assetsComplete =
    Boolean(data.noAssets) || (data.assets?.length ?? 0) > 0

  const conflictDecided = data.conflictOfInterest !== null

  const checks: { label: string; done: boolean }[] = [
    { label: "Rozhodnutí o střetu zájmů", done: conflictDecided },
    { label: "Sekce B – majetek", done: assetsComplete },
    { label: "Sekce C – způsob předání agendy", done: handoverChoiceMade },
    ...(handoverChoiceMade
      ? [
          {
            label: "Podpis předání agendy vedoucím",
            done: Boolean(data.handoverManagerSignature?.signedAt),
          },
        ]
      : []),
    {
      label: "Podpis zaměstnance",
      done: Boolean(data.signatures?.employee?.signedAt),
    },
    {
      label: "Podpis vedoucího odboru",
      done: Boolean(data.signatures?.manager?.signedAt),
    },
    {
      label: "Potvrzení Odboru služeb (správnost výpisu majetku)",
      done: Boolean(data.signatures?.issuer?.signedAt),
    },
  ]

  const missingSections: string[] = []
  if (rowsFraction < 1) {
    const remaining = requiredItems.length - resolvedSignedCount
    missingSections.push(
      `Sekce A – zbývá ${remaining} ${remaining === 1 ? "řádek" : "řádků"}`
    )
  }
  checks.forEach((check) => {
    if (!check.done) missingSections.push(check.label)
  })

  const doneWeight = checks.filter((c) => c.done).length + rowsFraction
  const totalWeight = checks.length + 1
  const percent = Math.round((doneWeight / totalWeight) * 100)

  const isComplete = missingSections.length === 0

  return {
    isComplete,
    rowsComplete,
    headerComplete,
    handoverComplete,
    option2Complete,
    option3Complete,
    percent,
    missingSections,
  }
}
