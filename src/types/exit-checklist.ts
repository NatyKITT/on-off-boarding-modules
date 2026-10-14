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
  note: string | null
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

export interface HandoverSendHistoryEntry {
  id: string
  name: string
  email: string
  personalNumber?: string | null
  department?: string | null

  lastSentAt: string | null
  lastSentByName: string | null
  lastSentByEmail: string | null
  sentCount: number
  cancelledAt?: string | null
}

export interface HandoverResponsiblePerson {
  id: string
  name: string
  email: string
  personalNumber?: string | null
  department?: string | null

  handoverInfoLastSentAt?: string | null
  handoverInfoLastSentByName?: string | null
  handoverInfoLastSentByEmail?: string | null
  handoverInfoSentCount?: number | null
}

export type HandoverRecipient = HandoverResponsiblePerson

export interface HandoverAgendaData {
  includeHandoverAgenda?: boolean

  option1?: boolean
  option1Note?: string
  option2?: boolean
  option2Target?: string
  option2TargetPositionNum?: string
  option2TargetDepartment?: string
  option2TargetUnitName?: string

  option3?: boolean
  option3Reason?: string

  responsibleParty?: "KITT6" | "OSS_KT" | null

  handoverRecipients?: HandoverResponsiblePerson[]
  handoverSendHistory?: HandoverSendHistoryEntry[]
  handoverRecipientsSentAt?: string | null
  handoverRecipientsSentByName?: string | null
  handoverRecipientsSentByEmail?: string | null
  handoverRecipientsSentHash?: string | null
  handoverRecipientsSentCount?: number | null

  handoverNotifiedAt?: string | null
  handoverNotifiedTo?: string | null
  handoverNotifiedTarget?: string | null
}

export interface ExitChecklistResponsiblePerson {
  name: string
  position?: string
  department?: string
  email: string
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
  managerEmail?: string | null
}

export interface ExitChecklistHrEditMarker {
  name: string
  email: string
  role?: string
  at: string
}

export interface ExitChecklistData {
  id?: number
  offboardingId: number
  publicToken?: string | null
  conflictOfInterest?: boolean | null
  employeeName: string
  personalNumber: string | null
  department: string
  unitName: string
  positionNum?: string | null
  positionName?: string | null
  employmentEndDate: string
  lockedAt: string | null
  employeeEmail?: string | null
  managerEmail?: string | null
  managerName?: string | null
  managerPosition?: string | null
  managerDepartment?: string | null
  handoverManagerSignature?: ExitChecklistSignatureValue | null
  assetsEditedByHR?: ExitChecklistHrEditMarker | null
  handoverEditedByHR?: ExitChecklistHrEditMarker | null

  completedAt?: string | null
  completedNotificationSentAt?: string | null
  completedNotificationSentByName?: string | null
  completedNotificationSentByEmail?: string | null
  completedNotificationSentTo?: string | null

  items: ExitChecklistItem[]
  assets: ExitAssetItem[]
  noAssets?: boolean
  handover?: HandoverAgendaData
  signatures?: ExitChecklistSignatures

  signatureRecipients?: ExitChecklistSignatureRecipient[]
  signatureRecipientsSentAt?: string | null
  signatureRecipientsSentByName?: string | null
  signatureRecipientsSentByEmail?: string | null

  sectionBResponsible?: ExitChecklistResponsiblePerson | null
  kitt6OptionContact?: ExitChecklistResponsiblePerson | null
}

export interface ExitChecklistSignatureRecipient {
  name: string
  email: string
  rowKeys?: string[]
  behalfLabel?: string
  invitedAt?: string
  revokedAt?: string
  substituteForKey?: string
  position?: string
  department?: string
}
