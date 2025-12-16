export type ExitChecklistRowKey =
  | "sneoChip"
  | "sneoRemote"
  | "serviceTools"
  | "handoverProtocol"
  | "centralRegistry"
  | "classifiedDocs"
  | "electronicTicket"
  | "carChip"
  | "cashAdvance"
  | "serviceId"
  | "socialFundLoan"
  | "phoneCosts"
  | "itEquipment"
  | "espis"
  | "fineBlocks"

export type ExitResolvedValue = "YES" | "NO" | null

export interface ExitChecklistRowDefinition {
  key: ExitChecklistRowKey
  organization: string
  obligation: string
}

export interface ExitChecklistItem extends ExitChecklistRowDefinition {
  resolved: ExitResolvedValue
  signedByName: string | null
  signedByEmail: string | null
  signedAt: string | null
}

export interface ExitAssetItem {
  id: string
  subject: string
  inventoryNumber: string
}

export interface ExitChecklistData {
  id?: number
  offboardingId: number
  employeeName: string
  personalNumber: string | null
  department: string
  unitName: string
  employmentEndDate: string
  lockedAt: string | null
  items: ExitChecklistItem[]
  assets: ExitAssetItem[]
}
