export type ExitChecklistRoleSection = {
  title: string
  description: string
}

export const EXIT_CHECKLIST_MANAGER_SECTIONS: ExitChecklistRoleSection[] = [
  {
    title: "Hlavička formuláře",
    description: "Podpis vedoucího odboru.",
  },
  {
    title: "Sekce A – Vyrovnání závazků",
    description: "Potvrzení o převzetí písemného předávacího protokolu.",
  },
  {
    title: "Sekce C – Předávaná agenda",
    description:
      "Vyberte způsob předání elektronických dokumentů v e-spisu a potvrďte ho podpisem.",
  },
]

export const EXIT_CHECKLIST_MANAGER_ROLE_NOTE = [
  "Jako vedoucí odboru potvrzujete a podepisujete tyto sekce:",
  ...EXIT_CHECKLIST_MANAGER_SECTIONS.map(
    (section) => `${section.title}: ${section.description}`
  ),
].join("\n")

export const EXIT_CHECKLIST_MANAGER_HEADER_SUBTITLE =
  "Pozvánka k podpisu – Vedoucí odboru"

export const EXIT_CHECKLIST_SECTION_B_ROLE_NOTE =
  "Prosíme o vyplnění a podpis sekce B (Majetek)."

export const EXIT_CHECKLIST_EMPLOYEE_ROLE_NOTE =
  "Výstupní list ještě nemáte podepsaný – prosíme sledujte průběh a fyzicky vyřiďte a odevzdejte vše včas."
