export const OTHER_BANK_VALUE = "OTHER"

export const BANK_OPTIONS = [
  { value: "CESKA_SPORITELNA", label: "Česká spořitelna" },
  { value: "CSOB", label: "ČSOB" },
  { value: "KOMERCNI_BANKA", label: "Komerční banka" },
  { value: "UNICREDIT", label: "UniCredit Bank" },
  { value: "RAIFFEISENBANK", label: "Raiffeisenbank" },
  { value: "MONETA", label: "Moneta Money Bank" },
  { value: "FIO", label: "Fio banka" },
  { value: "AIR_BANK", label: "Air Bank" },
  { value: "MBANK", label: "mBank" },
  { value: "CREDITAS", label: "Banka Creditas" },
  { value: "TRINITY_BANK", label: "Trinity Bank" },
  { value: OTHER_BANK_VALUE, label: "Jiná (vypište)" },
] as const
