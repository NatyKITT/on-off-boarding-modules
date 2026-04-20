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
  | "lawInfo"
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
  createdById?: string | null
}

export interface HandoverAgendaData {
  includeHandoverAgenda?: boolean
  option1?: boolean
  option2?: boolean
  option2Target?: string
  option2TargetPositionNum?: string
  option3?: boolean
  option3Reason?: string
  responsibleParty?: "KITT6" | "OSSL_KT" | null
}

export interface ExitChecklistSignatureValue {
  signedByName: string | null
  signedByEmail: string | null
  signedAt: string | null
}

export interface ExitChecklistSignatures {
  employee: ExitChecklistSignatureValue
  manager: ExitChecklistSignatureValue
  issuer: ExitChecklistSignatureValue
  issuedDate: string
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
  handover?: HandoverAgendaData
  signatures?: ExitChecklistSignatures
}
