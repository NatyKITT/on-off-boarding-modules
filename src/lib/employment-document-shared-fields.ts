export const SHARED_IDENTITY_FIELDS = [
  "firstName",
  "lastName",
  "birthSurnameDiffers",
  "birthSurname",
  "titleBefore",
  "titleAfter",
  "academicDegrees",
  "maritalStatus",
  "birthDate",
  "birthNumber",
  "birthPlace",
  "birthDistrict",
  "birthState",
  "citizenship",
  "citizenshipOther",
  "permanentStreet",
  "permanentHouseNumber",
  "permanentCity",
  "permanentPostcode",
] as const

export type SharedIdentityField = (typeof SHARED_IDENTITY_FIELDS)[number]

export type SharedIdentityData = Partial<Record<SharedIdentityField, unknown>>

export function extractSharedIdentityData(
  data: Record<string, unknown>
): SharedIdentityData {
  const result: SharedIdentityData = {}

  for (const field of SHARED_IDENTITY_FIELDS) {
    const value = data[field]
    if (value !== undefined && value !== null && value !== "") {
      result[field] = value
    }
  }

  return result
}

export function hasAnySharedIdentityData(data: SharedIdentityData): boolean {
  return Object.keys(data).length > 0
}

const PREFILL_DISPLAY_GROUPS: {
  label: string
  fields: SharedIdentityField[]
}[] = [
  {
    label: "jméno, příjmení a tituly",
    fields: [
      "firstName",
      "lastName",
      "titleBefore",
      "titleAfter",
      "academicDegrees",
    ],
  },
  { label: "rodné příjmení", fields: ["birthSurname"] },
  { label: "rodinný stav", fields: ["maritalStatus"] },
  {
    label: "datum a místo narození",
    fields: ["birthDate", "birthPlace", "birthDistrict", "birthState"],
  },
  { label: "rodné číslo", fields: ["birthNumber"] },
  { label: "státní občanství", fields: ["citizenship", "citizenshipOther"] },
  {
    label: "adresu trvalého pobytu",
    fields: [
      "permanentStreet",
      "permanentHouseNumber",
      "permanentCity",
      "permanentPostcode",
    ],
  },
]

export function getPrefillDisplayLabels(data: SharedIdentityData): string[] {
  return PREFILL_DISPLAY_GROUPS.filter((group) =>
    group.fields.some((field) => data[field] !== undefined)
  ).map((group) => group.label)
}
