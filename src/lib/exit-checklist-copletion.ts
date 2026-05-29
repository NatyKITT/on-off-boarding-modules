import type { ExitChecklistData } from "@/types/exit-checklist"

export function getExitChecklistCompletionState(data: ExitChecklistData) {
  const requiredItems = data.items.filter((item) => {
    if (item.key === "lawInfo" && !data.conflictOfInterest) return false
    return true
  })

  const rowsComplete = requiredItems.every(
    (item) => item.resolved !== null && Boolean(item.signedAt)
  )

  const headerComplete = Boolean(
    data.signatures?.employee?.signedAt &&
      data.signatures?.manager?.signedAt &&
      data.signatures?.issuer?.signedAt
  )

  const handoverComplete =
    !data.handover?.includeHandoverAgenda ||
    Boolean(data.handoverManagerSignature?.signedAt)

  const option2Complete =
    !data.handover?.option2 ||
    Boolean(
      data.handover.option2Target?.trim() ||
        data.handover.option2TargetPositionNum?.trim()
    )

  const option3Complete =
    !data.handover?.option3 || Boolean(data.handover.option3Reason?.trim())

  const isComplete =
    rowsComplete &&
    headerComplete &&
    handoverComplete &&
    option2Complete &&
    option3Complete

  return {
    isComplete,
    rowsComplete,
    headerComplete,
    handoverComplete,
    option2Complete,
    option3Complete,
  }
}
