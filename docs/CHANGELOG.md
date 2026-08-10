# Changelog

Historie významných změn v aplikaci On-Off-Boarding Modul. Nejnovější verze nahoře.

## 0.7.0 – 2026-08-10

### Nové funkce

- **Upozornění vedoucímu po vyjádření tajemníka** – jakmile tajemník úřadu dokončí své vyjádření k vyhodnocení zkušební doby, dostane nadřízený (ten, kdo formulář vyplnil), e-mailem informaci, že se tajemník vyjádřil a jestli souhlasí, nebo nesouhlasí, **včetně finálního podepsaného PDF v příloze** (stejně jako dostává HR). Dosud tato notifikace neexistovala.
- **Přehlednější PDF vyhodnocení zkušební doby** – doporučení vedoucího odboru a (je-li potřeba) vyjádření tajemníka jsou nově každé ve vlastním ohraničeném rámečku s podpisem vpravo, místo souvislého textu pod sebou. Pokud se rámeček nevejde na stránku, na pokračovací stránce se už neopakuje nadpis „Vyhodnocení zkušební doby“ – jen samotný rámeček, aby zbylo víc místa.
- **Kompletní hlavička u formuláře pro tajemníka** – veřejná stránka, na které se tajemník vyjadřuje, nově nahoře zobrazuje celý kontext (zaměstnanec, osobní číslo, odbor/oddělení, pracovní poměr od, pozice, konec zkušební doby, hodnotitel/vedoucí odboru) a jasně odděluje vyplněné hodnocení vedoucího (ohraničená needitovatelná sekce „Vyjádření k vyhodnocení vedoucího odboru k pokračování pracovního poměru“, včetně jeho podpisu) od vlastního vyjádření tajemníka, aby bylo jednoznačné, co kdo vyplnil.
- **Sjednocený řádek „Vedoucí“ ve všech e-mailech k vyhodnocení zkušební doby** – e-mail s PDF pro HR a žádost o vyjádření zaslaná tajemníkovi nově obsahují stejný řádek se jménem a e-mailem vedoucího jako pozvánka, připomínka a upomínka HR (tam už byl).
- **Finální e-mail HR po vyjádření tajemníka** ukazuje obě stanoviska najednou – doporučení vedoucího (ANO/NE) i vyjádření tajemníka (souhlasí/nesouhlasí) – v textu zprávy, ne jen v příloze PDF.
- **Gramaticky správný rod v e-mailech** – tam, kde je k dispozici konkrétní jméno vedoucího nebo tajemníka, se tvary jako „vyplnil/vyplnila“, „doporučil/doporučila“, „vyjádřil/vyjádřila“ volí podle rodu odhadnutého z příjmení (typická česká ženská příjmení na „-á“). Bez jména zůstává obecný tvar „vyplnil(a)“.
- **Přejmenované dlaždice v detailu vyhodnocení** (interní správa u nástupu) – „Hodnotitel / podpis“ → „Vedoucí / hodnotitel“, „Stanovisko tajemníka“ → „Vyjádření tajemníka“.

### Opravy

- Text žádosti o vyjádření zaslané tajemníkovi upřesněn na „vedoucí odboru vyplnil(a) formulář…“ (dřív jen „vedoucí“).
- Hláška po odeslání vyjádření tajemníkem nově výslovně říká, že informace šla na Personální oddělení **i** vedoucímu, který formulář vyplnil.
- Tlačítko u vyjádření tajemníka během ukládání/odesílání zobrazuje „Ukládám a odesílám…“ stejně jako formulář vedoucího (dřív jen „Odesílám…“).
- E-mail s PDF pro HR po finálním vyplnění/vyjádření tajemníka/revizi už neříká zavádějící „Personální oddělení vám zasílá…“ (HR je přece sám příjemce) – místo toho jasně uvádí, kdo formulář vyplnil (vedoucí, nebo tajemník).
- V ohraničených rámečcích v PDF (doporučení vedoucího, vyjádření tajemníka) opravena nedostatečná mezera pod nadpisem, chybějící mezera před „Důvod“/„Komentář“ a přetékající text u poznámky o elektronickém podpisu (dřív se nezalamoval a mohl přesahovat mimo rámeček i stránku).

Tato verze nepřidává žádnou novou databázovou migraci – jde jen o úpravy e-mailů, PDF a UI.

---

## Deployment checklist k verzi 0.7.0

- [ ] **Žádná nová migrace.** Stačí nasadit kód a restartovat/redeploy aplikaci.
- [ ] Žádné nové proměnné prostředí ani npm závislosti nejsou potřeba.
- [ ] Po nasazení ověřit na jednom testovacím nástupu s vyjádřením tajemníka:
  - PDF má doporučení vedoucího a vyjádření tajemníka v ohraničených rámečcích s podpisem, text se nikde nepřekrývá ani nepřesahuje,
  - e-mail s PDF pro HR i žádost tajemníkovi obsahují řádek „Vedoucí“ a úvodní text správně říká, kdo formulář vyplnil,
  - po vyplnění tajemníkem dostane HR e-mail s oběma stanovisky a **vedoucí** dostane samostatný e-mail o vyjádření tajemníka i s PDF v příloze,
  - v detailu vyhodnocení (interní správa u nástupu) se dlaždice jmenují „Vedoucí / hodnotitel“ a „Vyjádření tajemníka“.

## 0.6.0 – 2026-08-10

### Nové funkce

- **Vedoucí oddělení u odchodu** – automaticky se dohledává podle čísla funkce (stejný mechanismus jako u nástupu), ve formuláři odchodu jde ručně přepsat nebo znovu dohledat tlačítkem "Obnovit dle pozice". Výstupní list (exit checklist) si při založení vedoucího automaticky přebírá z tohoto pole, místo aby zůstával prázdný.
- **PDF v e-mailu HR o dokončení výstupního listu** – jakmile podepíšou zaměstnanec, vedoucí i vydávající, e-mail HR o dokončení teď obsahuje rovnou podepsané PDF v příloze (dřív jen odkaz).
- **Informační e-mail odcházejícímu zaměstnanci** – po dokončení výstupního listu automaticky dostane e-mail, že je podepsaný a má se dostavit na Personální oddělení pro zápočtový list.
- **Cílené připomínky k podpisu výstupního listu** – nový cron mechanismus (30/14/7/3/2/1 den před koncem) posílá připomínku přímo tomu, kdo ještě nepodepsal (zaměstnanci nebo vedoucímu) – ale jen tomu, komu HR pozvánku k podpisu už dříve skutečně odeslala.
- **Rozšířená souhrnná upomínka pro HR** – existující upomínka (dřív 30/14/7/3 dny) nově běží i na 2 a 1 den před koncem a text se liší podle toho, jestli už vůbec byla odeslána pozvánka k podpisu ("nutno odeslat pozvánku" vs. "list stále čeká na podpis").
- **Pozice ve výstupním listu** – v hlavičce výstupního listu (interní zobrazení) přibyl název pozice a číslo funkce zaměstnance.

### Opravy

- Odstraněno zbytečné potvrzovací okénko při výběru zaměstnance z EOS ve formuláři odchodu – klik na osobu ji rovnou vybere.
- Opravena chyba "controlled/uncontrolled input" ve formuláři odchodu (chybějící výchozí hodnoty u nových polí vedoucího).
- `getOrCreateChecklist` je teď odolný vůči souběhu dvou současných požadavků (dřív mohl spadnout na unique constraint, když se výstupní list zakládal poprvé).
- Sjednocena velikost ikony fajfky u tlačítek "Podepsat"/"Podepsat v zastoupení" napříč výstupním listem (chyběla třída `shrink-0`, ikona se v užších tlačítkách mohla vizuálně zmenšit).

---

## Deployment checklist k verzi 0.6.0

### DEV

- [ ] Migrace `prisma migrate deploy` už byla na DEV aplikovaná – zkontrolovat, že je vše v pořádku (`prisma migrate status` by mělo hlásit "up to date", `/odchody` i výstupní listy fungují). Pokud by se přesto něco neshodovalo, lze `prisma migrate deploy` bez obav spustit znovu.

### PRODUKCE

- [ ] **Musí se nasadit** – spustit `prisma migrate status`, ověřit skutečný stav a pak `prisma migrate deploy`. Nové migrace od poslední produkční verze (celkem 4):
  - `20260805110209_add_tajemnik_review`
  - `20260805170857_add_tajemnik_override`
  - `20260805215217_remove_tajemnik_override_columns`
  - `20260810111116_add_offboarding_supervisor`
- [ ] Po migraci spustit `prisma generate` a restartovat/redeploy aplikaci, ať běží s aktuálním Prisma Clientem.
- [ ] Žádné nové proměnné prostředí ani npm závislosti nejsou potřeba.
- [ ] Po nasazení ručně ověřit na jednom testovacím odchodu:
  - auto-vyplnění vedoucího ve formuláři odchodu,
  - založení výstupního listu (vedoucí se do něj přenese automaticky),
  - dokončení výstupního listu (PDF v e-mailu HR, informační e-mail zaměstnanci),
  - cron `offboarding-notifications` doběhne bez chyby (ideálně ručně přes `?force=true`).

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
