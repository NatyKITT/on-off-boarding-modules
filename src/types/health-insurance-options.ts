export const OTHER_HEALTH_INSURANCE_VALUE = "OTHER"

export const HEALTH_INSURANCE_OPTIONS = [
  { value: "111", label: "Všeobecná zdravotní pojišťovna ČR (111)" },
  { value: "201", label: "Vojenská zdravotní pojišťovna ČR (201)" },
  { value: "205", label: "Česká průmyslová zdravotní pojišťovna (205)" },
  { value: "207", label: "Zaměstnanecká pojišťovna Škoda (207)" },
  { value: "211", label: "Zdravotní pojišťovna ministerstva vnitra ČR (211)" },
  {
    value: "213",
    label: "Revírní bratrská pokladna, zdravotní pojišťovna (213)",
  },
  { value: OTHER_HEALTH_INSURANCE_VALUE, label: "Jiná (vypište)" },
] as const
