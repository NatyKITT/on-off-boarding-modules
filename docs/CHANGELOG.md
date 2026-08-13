# Changelog

Historie významných změn v aplikaci On-Off-Boarding Modul. Nejnovější verze nahoře.

## 0.10.0 – 2026-08-13

### Nové funkce

- **Neuskutečněný odchod** – u plánovaného i skutečného odchodu jde nově tlačítkem "Neuskutečnil se" označit, že zaměstnanec nakonec neodešel (zůstal, přešel na jiné oddělení apod.). Záznam se přesune do nové sekce/záložky "Neuskutečněné" (stejně jako to už funguje u Nástupů), zmizí z aktivních filtrů plánovaných/skutečných odchodů i ze statistik, a jde ho kdykoliv tlačítkem "Vrátit" obnovit zpět tam, kde byl (do plánovaných, nebo do skutečných, pokud už měl vyplněné skutečné datum odchodu) – i opakovaně tam a zpět, vše se zaznamenává do historie záznamu. Důvod zrušení je u odchodu (na rozdíl od nástupu) nepovinný.
- Filtr "Stav" u Odchodů má nově stejné možnosti jako u Nástupů: Plánované, Skutečné, Neuskutečněné a Vše (dřívější volba "Obojí" nahrazena volbou "Vše", která navíc počítá i s neuskutečněnými).
- V okně "Generovat PDF report" jde u Odchodů nově zahrnout i "Neuskutečněné" (dřív bylo jen u Nástupů).
- Statistiky mají novou kartu "Neuskutečněné odchody" (KPI karty, srovnání let, PDF export) a odpovídající novou vlastní metriku pro vlastní přehledy – zrcadlí už existující "Neuskutečněné nástupy".
- V adminovi (správa uživatelů a rolí) se teď u jména zobrazují i tituly před/za jménem, ne jen jméno a příjmení.
- **Barevné rozlišení karet v přehledu Dokumentů** – karta každé osoby je jemně podbarvená podle toho, jestli jde o plánovaný nebo skutečný nástup/odchod (nástupy modře/zeleně, odchody oranžově/červeně, zrušené záznamy šedě).
- **Náhled dokumentu přímo na stránce** – u každého dostupného dokumentu (nástupní dokumenty, vyhodnocení zkušební doby, výstupní list) je nově tlačítko "Náhled", které dokument otevře v okně přímo na stránce, bez nutnosti stahování.
- **Krátká poznámka u každého dokumentu** – pod stavem dokumentu je vidět, na čem dokument je: "Zatím neodesláno", "Odesláno [datum] ([jméno])" (u automatického odeslání cronem místo jména "automaticky"), případně i poslední připomínka, nebo "Vyplněno [datum]".
- **Jeden přepínací tlačítko místo dvou** pro "Rozbalit vše"/"Sbalit vše" v přehledu Dokumentů – vždy je vidět jen ta akce, která reálně přijde v úvahu. Stejné tlačítko nově funguje i na úrovni jednotlivého roku ("Rozbalit měsíce"/"Sbalit měsíce").
- **Nástupy a Odchody jako záložky** v přehledu Dokumentů – místo dlouhého seznamu pod sebou jde mezi nimi přepínat jako mezi dvěma záložkami vedle sebe, s počtem záznamů rovnou na záložce.
- **Filtr "Stav odeslání"** v přehledu Dokumentů (nevytvořeno/neodesláno/odesláno-nevyplněno/vyplněno) – jde podle něj dohledat, komu se ještě nějaký dokument nebo formulář vůbec neposlal.
- **Indikátor načítání u náhledu dokumentu** – dokud se PDF v okně náhledu nenačte, zobrazí se točící se ikona, aby bylo jasné, že se něco děje.

### Opravy

- Zrušené (neuskutečněné) odchody se už nezapočítávaly správně do statistik – nově se stejně jako u nástupů úplně vyřazují z počtu plánovaných/skutečných odchodů, z aktuálního stavu zaměstnanců i z podílu odchodů během zkušební doby.
- Přehled Dokumentů u odchodů správně rozlišuje, jestli je odchod zrušený (dřív se u odchodů toto vždy tvářilo jako "ne", i když zrušený byl).
- Popisek filtru "Po termínu" u plánovaných odchodů byl zavádějící ("Již odešel / po termínu") u odchodů, které ještě nebyly potvrzené jako skutečné – přejmenováno na "Po termínu, nepotvrzeno".
- Informační okno "Evidováno v odchodech/nástupech" u propojeného záznamu správně píše, že je zrušený zrovna ten odchod (dřív text vždy tvrdil, že jde o zrušený nástup, i když šlo o zrušený odchod).
- U vyhodnocení zkušební doby i u výstupního listu odebráno tlačítko "Otevřít" z přehledu Dokumentů (vedlo na interní správu procesu, ne na náhled) – teď stačí "Náhled".
- **Filtry, vyhledávání a rozbalené roky/měsíce/záložky se už nepamatují při přechodu na jinou stránku** (Nástupy, Odchody, Změny, Dokumenty, Statistiky) – při otevření modálního okna nebo úpravě záznamu na téže stránce se samozřejmě dál drží, ale jakmile se přejde jinam, začíná se od výchozího stavu. Vedlejší efekt: tím zmizely i dvě související chyby, které se předtím objevovaly kvůli tomuto zapamatovávání – chyba hydratace v prohlížeči ("Text content did not match... Server: srpen 2026 Client: červen 2026") a pád stránky Dokumenty ("Cannot read properties of undefined") při starých zapamatovaných filtrech z doby před přidáním filtru "Stav odeslání".
- Opravena nefunkční statická (sticky) viditelnost sloupce "Zaměstnanec" při horizontálním scrollování u Odchodů (tabulka měla zdvojený scrollovací kontejner) – funguje teď stejně jako u Nástupů a Změn, včetně mobilu.
- **Dialogy se po otevření už neotevírají scrollnuté v polovině – a nadpis s křížkem na zavření se už neposouvá pryč při scrollování obsahu.** Šlo o skutečnou strukturální chybu ve 12 formulářových dialozích napříč aplikací (zakládání/úprava nástupu a odchodu na Nástupech, Odchodech i na Přehledu, zakládání/úprava změny na Změnách): scrollovala se rovnou celá karta dialogu včetně nadpisu, místo aby zůstal nadpis pevně nahoře a scrolloval se jen obsah formuláře. Opraveno ve třech krocích: (1) obecně se ve všech dialozích vypnulo výchozí přeskočení focusu na první pole, které prohlížeč posouvalo do zobrazení, (2) u odchodu navíc formulář sám o sobě po otevření natvrdo přesouval focus na pole "Datum podání výpovědi" uprostřed formuláře – toto automatické přeskočení focusu se u odchodu úplně zrušilo, (3) u zmíněných 12 dialogů se nadpis oddělil od scrollovatelného obsahu (stejný vzor jako už dřív fungoval u výstupního listu nebo "Odeslat všem k podpisu").
- **Zavírání kliknutím vedle dialogu vypnuto v podstatě ve všech modálních oknech v celé aplikaci** – včetně rychlého zakládání/potvrzování nástupu a odchodu z Přehledu (kalendáře), náhledu PDF v Dokumentech, a dalších desítek dialogů na detailech nástupu/odchodu/změny (mazání, vrácení do plánovaných, potvrzení), ne jen u hlavních formulářů jako dosud – zavřít jde jen tlačítkem, takže se rozdělaná práce nebo pozice v seznamu už neztratí omylem.
- **Změny: dialogy "Přidat/Upravit změnu" nezešednou pozadí** – měly omylem nastavený nemodální režim (na rozdíl od Nástupů/Odchodů), takže šlo klikat i psát mimo otevřený dialog a pozadí se netmavilo. Sjednoceno se stejným chováním jako u Nástupů/Odchodů.
- Tlačítka "Stáhnout vše" a "Poslat vše" v přehledu Dokumentů jsou nově bílá, aby byla dobře vidět i na podbarvené kartě osoby.

Tato verze přidává novou databázovou migraci (`add_offboarding_cancellation` – nová hodnota stavu `CANCELLED` a pole `cancelledAt`/`cancelledBy`/`cancelReason` u odchodu), žádnou novou proměnnou prostředí.

---

## Deployment checklist k verzi 0.10.0

- [ ] **Nová migrace.** Před nasazením spustit `npx prisma migrate deploy` (nebo ekvivalent v CI/CD), teprve pak nasadit kód.
- [ ] Po nasazení zkusit otevřít "Přidat plánovaný/skutečný nástup/odchod" (na Nástupech, Odchodech i z Přehledu) a "Přidat/Upravit změnu" – ověřit, že se dialog otevře odshora, nadpis se zavíracím křížkem zůstane při scrollování nahoře a kliknutí mimo dialog ho nezavře.
- [ ] Ověřit, že se u "Přidat/Upravit změnu" pozadí za dialogem ztmaví (dřív se u těchto dvou dialogů netmavilo).
- [ ] Zkusit přehled Dokumentů: záložky Nástupy/Odchody, filtr "Stav odeslání", náhled dokumentu a hromadné "Stáhnout vše"/"Poslat vše".
- [ ] Vyzkoušet u testovacího plánovaného i skutečného odchodu tlačítko "Neuskutečnil se" (bez i s vyplněným důvodem) a ověřit přesun do záložky "Neuskutečněné" i zpětné "Vrátit" – včetně opakovaného cyklu tam a zpět.
- [ ] Ověřit, že se neuskutečněný odchod nezapočítává do KPI karet ve Statistikách a objeví se nová karta "Neuskutečněné odchody".
- [ ] Zkontrolovat v adminovi, že se uživatelům s vyplněným titulem zobrazuje titul u jména.

## 0.9.0 – 2026-08-12

### Nové funkce

- **Historie i pro vyhodnocení zkušební doby** – v přehledu Dokumentů má teď tlačítko "Historie" i vyhodnocení zkušební doby, stejně jako to dřív měly jen nástupní dokumenty a výstupní list.
- **Hromadné stažení/odeslání dokumentů jedné osoby** – v přehledu Dokumentů po rozkliknutí konkrétního člověka jde tlačítkem stáhnout najednou všechny jeho dostupné dokumenty, nebo je všechny najednou poslat na jeden zadaný e-mail.
- **"Rozbalit vše" / "Sbalit vše"** u Nástupů a Odchodů v přehledu Dokumentů – rychlé rozbalení nebo sbalení všech roků a měsíců v dané sekci najednou.
- **Seznam nepodepsaných v souhrnné upomínce pro HR** – e-mail s upomínkou na blížící se konec pracovního poměru (30/14/7/3/2/1 den) teď u odchodů, kde už HR aspoň jednou odeslala "Odeslat všem k podpisu", obsahuje i konkrétní seznam jmen a e-mailů, kdo přesně ještě nepodepsal – nejen obecnou informaci, že list není hotový. Zapisuje se i do historie výstupního listu.

### Opravy

- Opraveno nefunkční scrollování myší v okně "Smazané záznamy".
- Vyhledávání v přehledu Dokumentů teď nalezenou osobu i s jejími dokumenty rovnou zobrazí, i když je "schovaná" v jinak sbaleném roku/měsíci – dřív bylo potřeba k ní ručně proklikat.
- Sekce v postranním menu nad Dokumenty přejmenována ze "Systém" na "Nástroje" (obsahuje Dokumenty, Statistiky, Nastavení).
- Opravena produkční chyba buildu `ESLint: Error while loading rule 'tailwindcss/enforces-negative-arbitrary-values': Could not resolve tailwindcss` – `tailwindcss` a `eslint-plugin-tailwindcss` byly jen mezi vývojářskými závislostmi, přesunuty mezi běžné závislosti, aby byly k dispozici i při produkčním buildu.

Tato verze nepřidává žádnou novou databázovou migraci ani proměnnou prostředí.

---

## Deployment checklist k verzi 0.9.0

- [ ] **Žádná nová migrace.** Stačí nasadit kód a restartovat/redeploy aplikaci.
- [ ] Před buildem spustit `pnpm install` (ne jen `--prod`), aby se přesun `tailwindcss`/`eslint-plugin-tailwindcss` v `package.json` promítl i do `pnpm-lock.yaml` na serveru.
- [ ] Po nasazení zkusit produkční build (`pnpm run build`) a ověřit, že už nepadá na chybě `Could not resolve tailwindcss`.

## 0.8.0 – 2026-08-12

### Nové funkce

- **Cron pro odchody nově sleduje plánované, ne skutečné odchody** – dokud je odchod jen plánovaný (`plannedEnd`, bez vyplněného `actualEnd`), automatizace kolem výstupního listu (souhrnná i cílená připomínka k podpisu) běží. Jakmile se odchod potvrdí jako skutečný, cron ho od té chvíle úplně přeskočí – opačná logika než u nástupů/zkušební doby.
- **Zapamatovaná skupina příjemců k podpisu výstupního listu** – při každém kliknutí na "Odeslat všem k podpisu" se aktuální (po úpravách) skupina lidí uloží u daného odchodu (`ExitChecklist.header.signatureRecipients`) a nahradí předchozí. Cílené cronové připomínky (14/7/3/2/1 den před koncem) se od té chvíle vždy počítají podle této uložené skupiny a posílají jen těm, kdo ještě nepodepsali – skupina se tak může lišit odchod od odchodu a lze ji kdykoliv upravit (přidat/odebrat příjemce) novým odesláním.
- **Tituly ve jménech a podpisech** – sdílené funkce pro sestavení celého jména (e-maily, PDF, reporty) nově vkládají čárku před titul za jménem ("Jan Novák, MBA" místo "Jan Novák MBA"). Klikací podpisy (výstupní list, vyhodnocení zkušební doby, vyjádření tajemníka) nově dotahují titul před/za jménem přihlášeného uživatele z jeho profilu, místo holého jména bez titulů.
- **Vážený pane tajemníku** – e-mail se žádostí o vyjádření zaslaný tajemníkovi nově oslovuje jménem ("Vážený pane tajemníku, [jméno],") místo obecného "Dobrý den".
- **Staticky viditelný sloupec "Zaměstnanec"** v tabulkách nástupů, odchodů i zaměstnaneckých změn – při horizontálním scrollování na akční tlačítka zůstává jméno zaměstnance vždy vidět.

### Opravy

- Formuláře nástupu a odchodu už neztrácí rozepsaná data při náhodném kliknutí mimo dialog – zavírání dialogu kliknutím na pozadí je vypnuté, zavřít lze jen tlačítkem.
- Opraveno chybné automatické zobrazení vyhodnocení pro tajemníka i v případě, kdy shodou okolností sedí jen e-mail, ale ne jméno – nově se ověřuje shoda e-mailu **i** jména. Případ, kdy je vedoucí odboru zároveň tajemníkem, se nadále vyhodnocuje jen jednou (žádné zdvojené schvalování ani e-mail navíc).
- "Tajemník" jako název funkce zůstává v e-mailech vždy v mužském tvaru ("tajemník se vyjádřil") bez ohledu na jméno konkrétní osoby – narozdíl od "vedoucí", kde se tvar řídí rodem konkrétní osoby.
- Sjednoceno pojmenování "Vedoucí odboru" (dřív na jednom místě formuláře odchodu a v dokumentaci ještě "Vedoucí oddělení").
- GitHub Actions "Mail Worker" už nepadá na e-mailu, který se jen dočasně nepodařilo odeslat a bude automaticky zopakován – workflow nově hlídá jen definitivně selhané joby (po vyčerpání všech pokusů), ne každý jednotlivý neúspěšný pokus.

Tato verze nepřidává žádnou novou databázovou migraci – nové pole `signatureRecipients` využívá existující flexibilní `Json` sloupec `ExitChecklist.header` (stejný vzor jako `handoverRecipients`).

---

## Deployment checklist k verzi 0.8.0

- [ ] **Žádná nová migrace.** Stačí nasadit kód a restartovat/redeploy aplikaci.
- [ ] Žádné nové proměnné prostředí ani npm závislosti nejsou potřeba.
- [ ] Po nasazení ověřit na jednom testovacím **plánovaném** odchodu (bez `actualEnd`): cron (`/api/cron/offboarding-notifications?force=true`) vytvoří upomínku; jakmile se doplní `actualEnd`, stejný cron už žádnou novou upomínku nevytvoří.
- [ ] V dialogu "Odeslat všem k podpisu" ověřit, že po odebrání/přidání příjemce a opětovném odeslání se v `ExitChecklist.header.signatureRecipients` uloží přesně nový seznam.
- [ ] Ověřit, že uživatel s vyplněnými tituly v profilu (`User.titleBefore`/`titleAfter`) má tituly (s čárkou před titulem za jménem) v podpisu i navazujícím e-mailu.

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

- **Vedoucí odboru u odchodu** – automaticky se dohledává podle čísla funkce (stejný mechanismus jako u nástupu), ve formuláři odchodu jde ručně přepsat nebo znovu dohledat tlačítkem "Obnovit dle pozice". Výstupní list (exit checklist) si při založení vedoucího automaticky přebírá z tohoto pole, místo aby zůstával prázdný.
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
