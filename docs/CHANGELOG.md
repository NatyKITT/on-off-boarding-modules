# Changelog

Historie významných změn v aplikaci On-Off-Boarding Modul. Nejnovější verze nahoře.

## 0.4.0 – 2026-08-03

### Nové funkce
- **Upomínky na blížící se konec pracovního poměru** – nový cron (`offboarding-notifications`) posílá HR upozornění 30/14/7/3 dní před koncem, pokud výstupní list ještě není hotový; na stránce výstupního listu se navíc zobrazí barevný banner (žlutý/červený podle blízkosti termínu).
- **Kombinovaný měsíční report e-mailem** – nové tlačítko „Zaslat měsíční report" (nástupy/odchody/změny) nahrazuje tři oddělené staré reporty jedním sjednoceným e-mailem s adaptivním předmětem a texty podle obsahu.
- **Historie smazaných záznamů** – u nástupů, odchodů i změn nové tlačítko „Smazané záznamy" s možností obnovy.
- **Automatické vyplnění jména** – při prvním přihlášení přes Google se jméno/příjmení nově natáhne z Google profilu; administrátor navíc může jméno ručně doplnit/opravit u každého uživatele.
- **Persistentní rozbalení sekcí** – rozbalené/sbalené roky a měsíce na stránce nástupů se pamatují mezi návštěvami.

### Opravy
- **Oprava pádu přihlášení** – chyba v ověřování relace mohla za určitých okolností shodit přihlášení; nyní je ošetřená a uživatele to neodhlásí.
- Sjednocené popisky role „HR/PO" napříč celou aplikací.
- Cron pro zkušební dobu nově běží tak, aby vždy trefil 8:00 i po přechodu na letní/zimní čas.
- Přeřazená a sjednocená akční tlačítka (Propojit účty, Historie) v tabulkách nástupů/odchodů/změn.

### RBAC / oprávnění
- Sjednocené kontroly oprávnění, skrytá (ne jen znepřístupněná) tlačítka pro úpravy u role READONLY.
- Nová sdílená hláška o chybějícím oprávnění a hezčí chybová stránka místo pádu.

### E-maily
- Kompletní přepracování HTML kombinovaného reportu – opravy zobrazení na mobilu, tmavý režim, sjednocené patičky a popisky u všech tabulek.
- Staré samostatné e-mailové šablony (personální změny, měsíční report) nahrazeny jednou sjednocenou.

### Interní/technické
- Refaktoring filtrů (`use-faceted-filter`, `use-text-filter`) a fronty e-mailů (`mail-queue`).
- Nová hodnota v evidenci historie výstupního listu (`DEADLINE_REMINDER_SENT`) – vyžaduje databázovou migraci.

---

## Deployment checklist k verzi 0.4.0

- [ ] **Databázová migrace** – spustit `prisma migrate deploy` (přidává hodnotu `DEADLINE_REMINDER_SENT` do enumu `ExitChecklistEventAction`, migrace je už vygenerovaná: `20260730131745_add_exit_checklist_deadline_reminder_action`).
- [ ] **Nový GitHub Actions cron** (`offboarding-cron.yml`) – aktivuje se automaticky po pushnutí na `main`. Používá **stejné** secrets jako stávající `probation-cron.yml` (`APP_URL`, `CRON_SECRET`) – pokud jsou už v repu nastavené, není potřeba nic dalšího přidávat.
- [ ] Žádné nové proměnné prostředí (`.env`) ani nové npm závislosti – stačí běžný `pnpm install` a `pnpm build`.
- [ ] Po nasazení zkontrolovat, že nový cron `offboarding-notifications` proběhl bez chyby (log v GitHub Actions).
