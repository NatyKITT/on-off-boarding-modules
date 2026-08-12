const PROBATION_EVALUATION_EVENT_ACTION_LABEL: Record<string, string> = {
  CREATED: "Vytvořeno",
  UPDATED: "Uloženo",
  INVITE_QUEUED: "Pozvánka naplánována",
  INVITE_SENT: "Pozvánka odeslána",
  REMINDER_QUEUED: "Připomínka naplánována",
  REMINDER_SENT: "Připomínka odeslána",
  HR_INFO_QUEUED: "Informace pro HR naplánována",
  HR_INFO_SENT: "Informace pro HR odeslána",
  HR_REMINDER_QUEUED: "Upomínka pro HR naplánována",
  HR_REMINDER_SENT: "Upomínka pro HR odeslána",
  MISSING_SUPERVISOR: "Chybí vedoucí",
  COMPLETED: "Vyplněno",
  EDITED: "Upraveno",
  RESET: "Vynulováno",
  LOCKED: "Uzamčeno",
  UNLOCKED: "Odemčeno",
  TOKEN_REGENERATED: "Odkaz znovu vygenerován",
  CANCELLED: "Zrušeno",
  EXPIRED: "Platnost odkazu vypršela",
  EMAIL_FAILED: "Odeslání e-mailu selhalo",
}

export function probationEvaluationEventActionLabel(action: string) {
  return PROBATION_EVALUATION_EVENT_ACTION_LABEL[action] ?? action
}
