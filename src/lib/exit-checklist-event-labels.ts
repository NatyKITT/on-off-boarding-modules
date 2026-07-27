const EXIT_CHECKLIST_EVENT_ACTION_LABEL: Record<string, string> = {
  LOCKED: "Uzamčeno",
  UNLOCKED: "Odemčeno",
  UPDATED: "Uloženo",
  ITEM_SIGNED: "Podpis",
  ITEM_SIGNATURE_CLEARED: "Podpis zrušen",
  ASSET_ADDED: "Přidána věc k vrácení",
  ASSET_UPDATED: "Upravena věc k vrácení",
  ASSET_REMOVED: "Odebrána věc k vrácení",
  SIGNATURE_INVITE_SENT: "Pozvánka k podpisu odeslána",
  HANDOVER_RECIPIENT_INVITE_SENT: "Info o předání agendy odesláno",
  PDF_DOWNLOADED: "PDF staženo/odesláno",
  EMAIL_FAILED: "Odeslání e-mailu selhalo",
}

export function exitChecklistEventActionLabel(action: string) {
  return EXIT_CHECKLIST_EVENT_ACTION_LABEL[action] ?? action
}
