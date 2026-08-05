# Changelog

Historie významných změn v aplikaci On-Off-Boarding Modul. Nejnovější verze nahoře.

## 0.5.0 – 2026-08-06

### Nové funkce
- **Vyjádření tajemníka u vyhodnocení zkušební doby** – pokud vedoucí, který vyplňuje vyhodnocení, není zároveň tajemník úřadu, po jeho odeslání se automaticky odešle e-mail s PDF a odkazem i tajemníkovi. Ten na stejném odkaze doplní souhlas/nesouhlas, komentář a podpis; teprve poté jde finální PDF s oběma stanovisky na Personální oddělení.
  - Pokud je vedoucí sám tajemníkem (podle EOS), nebo jde o nástup přímo na pozici tajemníka (vedoucím je pak starosta), druhá fáze se automaticky přeskočí – žádná extra otázka ani e-mail navíc.
  - Tajemníka lze pro testovací/přechodné účely ručně přepsat (jméno + e-mail) přímo v dokumentech u vyhodnocení zkušební doby, vedle údajů o vedoucím. Nastavení je globální – platí okamžitě pro všechny nástupy (aktuální i plánované), dokud se znovu nevrátí na automatické dohledávání z EOS.
  - HR může po odemknutí vyplněného formuláře upravit i stanovisko tajemníka (souhlas/nesouhlas, komentář) – podpis a čas podpisu tajemníka zůstávají zachované, změna se zapíše do historie.
- **Přehlednější "Stav procesu" a "Detail vyhodnocení"** – u nástupů s tajemníkem přibyly kroky "Odesláno tajemníkovi a HR", "Vyjádření tajemníka" a "Odesláno Personálnímu oddělení (finální)". Dlaždice s detaily (doporučení, hodnotitel, stanovisko tajemníka, zaslání/úpravy) mají sjednocený scroll, takže se delší obsah (komentáře) nezalamuje mimo dlaždici.

### Opravy
- Formulář k vyhodnocení zkušební doby už při ukládání/odesílání nedoplňuje jako "hodnotitele" automaticky e-mail aktuálně přihlášeného uživatele, pokud nic jiného není vyplněné.
- Po odeslání formuláře veřejným odkazem už původní vedoucí znovu neuvidí obsah vyhodnocení ani rozpracovanou sekci pro tajemníka – zobrazí se mu jen potvrzení o odeslání.

---

## Deployment checklist k verzi 0.5.0

- [ ] **Databázová migrace** – spustit `prisma migrate deploy`. Přidává se pole `tajemnikRequired` a hodnoty enumu `TAJEMNIK_REVIEW_SENT`/`TAJEMNIK_REVIEWED` (`20260805110209_add_tajemnik_review`), dále dočasná pole `tajemnikOverrideName`/`tajemnikOverrideEmail` (`20260805170857_add_tajemnik_override`) a jejich následné odstranění po přechodu na globální nastavení přes `SystemSettings` (`20260805215217_remove_tajemnik_override_columns`). Všechny tři migrace se aplikují v tomto pořadí najednou.
- [ ] Žádné nové proměnné prostředí ani npm závislosti – stačí běžný `pnpm install` a `pnpm build`.
- [ ] Po nasazení zkontrolovat na jednom testovacím nástupu, že se vyhodnocení zkušební doby s tajemníkem odešle a zobrazí správně (Stav procesu, Detail vyhodnocení, e-mail tajemníkovi).

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
