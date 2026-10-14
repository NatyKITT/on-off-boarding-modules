# Changelog

Historie významných změn v aplikaci On-Off-Boarding Modul. Nejnovější verze nahoře.

## 0.15.0 – 2026-10-01

### Nové funkce

- **Správa výstupního listu se nově otevírá na vlastní stránce** (`/odchody/[id]/vystupni-list`) místo modálního okna z přehledu Odchodů – stabilnější chování při podepisování více lidmi najednou, zpět vede vždy na přehled Odchodů. Stránka samotná existovala už dřív (používala se z detailu nástupu), teď se na ni odkazuje i z přehledu.
- **Jasné oddělení "co je potřeba nastavit a odeslat" od "samotného výstupního listu"** – na stránce výstupního listu je teď nejdřív karta "Nastavení a odeslání k podpisu" (střet zájmů, výpis majetku, předávaná agenda, odeslání k podpisu) a až pod tím samotné body výstupního listu k podpisu.
- **Střet zájmů musí být vědomě rozhodnutý před odesláním k podpisu** – dřív pole vždy mělo hodnotu ano/ne (výchozí ne), takže nešlo poznat, jestli to někdo vůbec vyplnil. Nově je to skutečná volba Ano/Ne bez výchozí hodnoty; dokud není vybraná, nejde výstupní list odeslat k podpisu (s vysvětlující hláškou).
- **Automatické hlídání prošlých plánovaných odchodů bez potvrzení** – pokud uplyne plánované datum odchodu a nikdo v appce nepotvrdil, jestli k odchodu skutečně došlo, objeví se nahoře v přehledu Odchodů červený banner s možností rovnou potvrdit ("Odešel") nebo označit jako neuskutečněný u každého jména; při více takových záznamech jde hromadně vybrat a vyřešit najednou. Personální oddělení navíc dostane den po plánovaném konci jednorázový e-mail s připomínkou a odkazem do přehledu.
- **Veřejná verze výstupního listu nyní skutečně rozlišuje role podle seznamu osob k podpisu** – odcházející zaměstnanec smí podepsat jen svůj vlastní řádek v hlavičce (nikdy ne za vedoucího ani jinou sekci), ale vidí celý výstupní list, historii změn a kdo co podepsal. Vedoucí odboru smí podepsat svůj podpis v hlavičce i řádek „předávací protokol" a má přístup do sekcí A a B, ale nesmí podepsat za zaměstnance. Ostatní podepisující nesmí na hlavičkové podpisy ani na sekci C (tu smí vyplnit a podepsat jen vedoucí nebo jeho zástup), mají přístup jen do sekce A a B. Konkrétní funkční signatáři (a jejich zástupci) smí podepsat i cizí řádek v sekci A, appka na to ale upozorní („Toto není vaše agenda"); důležité je, že se na ně dál spoléhají automatické připomínky – dokud nemají podepsané úplně všechny své přiřazené řádky, počítají se jako nepodepsaní.
- **Jednou podepsaný řádek v sekci A je uzamčený** – hodnotu Ano/Ne i poznámku u něj nejde dál měnit ani zrušit nikým jiným než tím, kdo podepsal (ten musí nejdřív zrušit svůj podpis). Prázdná poznámka se u uzamčeného řádku už nezobrazuje.
- **Redesign okna „Seznam a správa osob k podpisu výstupního listu"** – rozhodnutí o střetu zájmů je nahoře a odešle se/uloží až společně s ostatními změnami hlavním tlačítkem Uložit (s potvrzovacím oknem, co se komu odešle); odpovědné osoby za sekci B, sekci C (vedoucí odboru) a kontakt KITT6 jsou dole jako editovatelné „vizitky" propojené se zbytkem záznamu odchodu. Zavírací dialog při neuložených změnách nabízí Zůstat / Uložit / Zavřít bez uložení.
- **Oprava a zpřesnění zastupování** – zaškrtávátko přejmenováno na „Přidat jako zastupujícího za"; když se vybere zastoupení za osobu, která ještě není v seznamu, přidá se tam automaticky i ona a dostane dvojí info (vlastní pozvánka + info o zastoupení). Jednotný formát zobrazení u všech příjemců (jméno / e-mail / pozice - odbor, barevně odlišené poznámky kdo zastupuje koho) bez ohledu na to, jakým způsobem byli do seznamu přidáni.
- **Nový cron krok – kontrola před odesláním pozvánek** – dokud HR poprvé neodeslala žádnou pozvánku k podpisu, cron (od 1 měsíce před plánovaným koncem, u krátké výpovědní doby hned) upozorní, pokud chybí vedoucí odboru nebo není rozhodnutý střet zájmů.
- **Rozšířený rozvrh cílených připomínek** – z 14/7/3/2/1 na 14/7/5/3/2/1/0 dní před koncem; e-mail navíc obsahuje poznámku podle role (zaměstnanec / vedoucí / odpovědná osoba za sekci B), i při přímém (nikoli jen zastupujícím) odeslání pozvánky. Nový souhrnný report pro HR na stejné dny nahrazuje starší samostatnou 30/14/7/3/2/1denní upomínku.
- **E-mail zaměstnanci o dokončení** nově obsahuje i výzvu HR, ať si se zaměstnancem domluví předání zápočtového listu a poté výstupní list označí jako hotový a zamkne.
- **Přepracovaná pozvánka pro odcházejícího zaměstnance** – nově obsahuje očíslované kroky (1. fyzické vrácení majetku s přehledem odpovědných osob a kanceláří, 2. elektronický podpis se zvýrazněným tlačítkem a odkazem, 3. dokončení a vyzvednutí zápočtového listu) a kontaktní kartu Personálního oddělení v patičce.
- **Stažení PDF výstupního listu uvolněno i pro nedokončený list** – kdokoli s potvrzenou pozvánkou k podpisu (přihlášený přes praha6/kitt6 e-mail) smí stáhnout PDF, dokud list není uzamčený, bez ohledu na to, jestli je 100 % podepsaný.
- **Historie výstupního listu** je nově viditelná i odcházejícímu zaměstnanci ve veřejné verzi (dřív jen interní ADMIN/HR/IT).
- **Odpovědná osoba za sekci B** se při změně na jinou osobu automaticky propíše do seznamu příjemců k podpisu, aby jí šla odeslat pozvánka.
- **Odkaz „Přidat do kalendáře" odstraněn ze skutečných nástupů/odchodů a z personálních změn v měsíčních reportech** (u plánovaných nástupů/odchodů zůstává).
- **Redesign e-mailu pozvánky odcházejícímu zaměstnanci** – kroky 1–3 jsou nově tři samostatné, barevně odlišené karty s číslovaným odznakem, aby byly v e-mailu dobře vizuálně oddělené a výrazné.
- Tlačítko „Podepsat přesto" (u podpisu cizího řádku v sekci A) přejmenováno na „Přesto podepsat".
- Potvrzovací okno při ukládání seznamu osob k podpisu nově přesně rozlišuje, jestli se při uložení skutečně odešle nějaký e-mail – pokud ne (např. odebrání nikdy nepozvaného Právního odboru), nabídne jen „Uložit", ne „Uložit a odeslat".
- **E-maily o zastoupení a odebrání přepracovány na stejnou strukturu jako ostatní e-maily** – informace o zaměstnanci/odchodu je v samostatné tabulce, oddělené od informace o zástupci; e-mail zastupovanému nově obsahuje celé jméno, pozici a odbor zástupce a kontakt na Personální oddělení při nejasnostech. Při zrušení zastoupení dostává informaci (se stejnou strukturou, jen o zrušení) i původní zastupovaná osoba – dřív ji nedostala žádnou.
- Odebrání příjemce, kterému už byla dříve odeslána pozvánka k podpisu, po uložení pořád správně odesílá informační e-mail o odebrání (ověřeno, beze změny v mechanismu) – jen přepracovaný do přehlednější podoby se stejnou tabulkou jako ostatní e-maily.
- **E-mail o odebrání ze seznamu osob k podpisu přepracován na stejnou strukturu jako ostatní e-maily** – dřív jedna hutná věta se jménem, pozicí, odborem i datem odchodu zaměstnance, nově samostatná informační tabulka stejná jako u ostatních e-mailů k výstupnímu listu, oddělená od úvodní a závěrečné věty.
- **Sekce C (předání agendy) – oba informační e-maily nově uvádějí jméno a pozici/odbor vedoucího odboru** – e-mail na KITT6 kontakt i e-mail každé vybrané odpovědné osobě nově obsahuje celé jméno a pozici/odbor konkrétního vedoucího odboru, který danou volbu předání zvolil, místo obecné věty „Vedoucí odboru v rámci výstupního listu zvolil(a), že…".
- **Sekce C – změna již potvrzené volby po podpisu a uložení nově zruší předchozí informaci** – pokud vedoucí odboru po dřívějším podepsaném a uloženém předání agendy (KITT6 kontakt, nebo konkrétní odpovědné osoby) volbu znovu otevře, změní (jiný způsob předání, jiné cílové funkční místo u KITT6, jiný seznam odpovědných osob) a znovu podepíše a uloží, appka už dřív upozorněným osobám/kontaktu automaticky pošle e-mail se stejnou tabulkou, že tato dřívější varianta byla zrušena a byl potvrzen jiný způsob předání – žádné další kroky z jejich strany už nejsou potřeba. Platí jen pro skutečně odeslané informace (ne pro nikdy nenotifikované), e-mail se posílá jen při znovu podepsaném a uloženém výstupním listu (ve shodě s pravidlem, že platná je jen podepsaná volba), a to v interní appce i přes veřejný odkaz.
- **Nové potvrzovací okno „Uložit výstupní list?" před každým uložením** – shrnuje, co se po uložení skutečně odešle (nové pozvánky/info k sekci C, oznámení o zrušení dřívější volby KITT6 nebo odpovědným osobám, které v nové volbě už nejsou), a pokud přihlášený ve veřejné verzi ještě nemá podepsané všechny své řádky, upozorní, že mu budou dál chodit automatické připomínky. Tlačítka „Uložit a odeslat" / „Zpět k úpravě" (needitovalo se nic). Platí jednotně pro všechna místa uložení – tlačítko v samotném výstupním listu, tlačítka na stránce kolem něj i „Uložit a odejít" v okně o neuložených změnách.
- **Sekce C (předání agendy) nyní nezávisí na stavu sekce B (majetek)** – dřív šlo sekci C podepsat až po vyplnění majetku v sekci B, i když obě sekce řeší různé osoby a věci. Podpis sekce C teď blokují jen vlastní pole volby C.

### Opravy

- Oprava chyby, kdy přepnutí „Obsahuje výstupní list střet zájmů?" u ještě neodeslaného seznamu přepsalo celý rozpracovaný návrh zpět na výchozí – teď se vždy jen přidá/odebere Právní odbor.
- Oprava zobrazení jména u statických signatářů a Právního odboru – pozice a odbor se nově správně rozdělí do samostatných polí místo aby zůstaly slité v poli jméno.
- Oprava chybějící kontroly podpisu sekce C u vedoucího odboru v cronu (dřív stačil jen podpis v hlavičce).
- **Oprava mezery v oddělení rolí od admin oprávnění** – role nastavená v administraci appky (ADMIN/HR/IT/READONLY) se dřív i ve veřejné verzi počítala jako automatické oprávnění podepisovat, bez ohledu na to, jestli je dotyčný v seznamu osob k podpisu daného výstupního listu. Teď se ve veřejné verzi vždy řídí výhradně příslušností k tomuto seznamu.
- Oprava: odcházející zaměstnanec mohl ve veřejné verzi stále měnit Ano/Ne a poznámku v sekci A a podepsat sekci B (pole „Vydávající") – obě místa teď respektují, že zaměstnanec smí jen sledovat, ne upravovat ani podepisovat.
- Oprava chybějící pozice/odboru u příjemců – dohledávání v EOS adresáři omylem vylučovalo právě odcházejícího zaměstnance (má aktivní záznam odchodu), takže se jemu samotnému nikdy nedohledala pozice/odbor; opraveno i párování podle jména pro případy jiného pořadí nebo formátování.
- Oprava chybějící pozice/odboru u vedoucího odboru v seznamu příjemců – doplňuje se přímo z autoritativních dat karty vedoucího, ne jen nejistým dohledáním podle jména v adresáři.
- Odstraněn zbytečně duplicitní nadpis „Výstupní list – [jméno]" na interní stránce výstupního listu (stejné jméno už zobrazuje karta pod ním).
- Oprava zobrazení příjemců se shodným e-mailem jako jiný řádek v seznamu (typicky nový zástupce se shodou e-mailu) – jméno, e-mail i pozice/odbor se dřív u druhého výskytu skrylo a zelená poznámka „Zastupuje za" tak vizuálně splynula se špatným, nesouvisejícím řádkem. Teď se u každého řádku vždy zobrazí jeho vlastní identita, se stejnými rozestupy a dělicí čárkou mezi všemi záznamy.
- Popisek „zastupuje za" sjednocen na velké počáteční písmeno, stejně jako „Zastupuje:".
- **Oprava mezery v public verzi – odebraný příjemce byl i tak vidět, pokud měl roli ADMIN/HR/IT** – kontrola na zrušený přístup (`revokedAt`) ve veřejném API (`/api/odchody/public/[token]`, čtení i ukládání) se dřív přeskakovala pro interní role. Teď platí pro všechny stejně – odebraná osoba uvidí jen hlášku „Nemáte přístup k podpisu tohoto výstupního listu. Pokud je něco v nepořádku, kontaktujte Personální oddělení.", žádná data výstupního listu, dokud ji HR nevrátí zpět do seznamu.
- Podpis „Za Odbor služeb potvrzuje správnost Výpisu" (sekce B) je nově přímo needitovatelné (disabled) tlačítko s vysvětlujícím tooltipem, dokud není vyplněn majetek nebo zaškrtnuto „žádný majetek" – dřív šlo kliknout a teprve pak se zobrazila chybová hláška.
- **Zpřísnění ochrany proti opakovanému odeslání e-mailu o předání agendy na KITT6** – dřív se spoléhalo jen na kontrolu na straně prohlížeče; teď i server (`/handover-kitt6-notify`) sám odmítne znovu odeslat stejnou volbu (stejné cílové funkční místo), dokud se skutečně nezmění.

Vyžaduje databázovou migraci (nová hodnota `OFFBOARDING_DEPARTURE_CONFIRMATION` v enumu `MailJobType` pro frontu e-mailů, nové pole `note` u `ExitChecklistItem`) – bez dalších změn dat.

---

## Deployment checklist k verzi 0.15.0

- [ ] Nasadit migrace `add_offboarding_departure_confirmation_mail_type` a `add_exit_checklist_item_note`.
- [ ] V přehledu Odchodů kliknout na "Výstupní list" u řádku a ověřit, že se otevře stránka (ne modál) a tlačítko zpět vede na Odchody.
- [ ] U výstupního listu bez nastaveného střetu zájmů ověřit, že odeslání k podpisu je zablokované, a po výběru Ano/Ne se odemkne.
- [ ] Testovacímu odchodu nastavit `plannedEnd` pár dní do minulosti (bez `actualEnd`, bez `cancelledAt`) a ověřit banner v Odchodech i hromadné okno při více záznamech.
- [ ] Zavolat `/api/cron/offboarding-notifications?force=true` pro odchod s `plannedEnd` přesně včera a ověřit, že vznikne právě jeden e-mail v `MailQueue` (a při opakovaném volání znovu ne).
- [ ] Ve veřejné verzi výstupního listu vyzkoušet přihlášení jako odcházející zaměstnanec, jako vedoucí odboru a jako běžný podepisující a ověřit, že každý vidí/smí jen to, co má.

---

## 0.14.0 – 2026-09-29

### Nové funkce

- **Přehlednější odkazy k vyplnění nástupních dokumentů** – karta dokumentu nově ukazuje jeden ze 4 jasných stavů („Nezasláno, je potřeba zaslat" / „Zasláno, čeká na vyplnění" / „Zasláno a vyplněno" / „Platnost odkazu vypršela, je potřeba nový odkaz"), barevně odlišených (šedá/oranžová/zelená/červená), a datum posledního odeslání natrvalo z databáze (dřív se ztrácelo po zavření okna). U vypršených odkazů se nahoře v seznamu dokumentů objeví upozornění s tlačítkem „Vygenerovat nové odkazy", které obnoví najednou jen dosud nevyplněné dokumenty (vyplněné/podepsané se nedotkne) a rovnou připraví e-mail k odeslání. Sekce „Odeslat e-mail s odkazy" navíc při otevření okna Dokumenty automaticky předvybere k odeslání jen dokumenty, které opravdu čekají na odeslání (ne ty, co jsou už v pořádku odeslané nebo vypršelé a čekají na obnovu odkazu).
- **Automatické e-mailové připomínky k nástupním dokumentům** – zaměstnanci přijde upozornění 3 dny před vypršením odkazu k vyplnění, Personálnímu oddělení přijde upozornění v den vypršení, pokud dotazník pořád není vyplněný. Nově navíc dostane Personální oddělení upozornění i na dokumenty, které ještě vůbec nebyly zaměstnanci odeslány (3 dny před plánovaným nástupem, případně i zpětně po termínu nástupu). Počítá se jen od chvíle, kdy byl odkaz opravdu odeslán, ne od jeho vytvoření. Běží na stejném stávajícím denním spouštěči jako dřívější cron pro zkušební dobu, žádné nové nastavení plánovače není potřeba.
- **Kontrola shody jména a e-mailu s nástupem** – pokud si zaměstnanec při vyplňování osobního nebo mzdového dotazníku zadá jiné jméno/příjmení/tituly (nebo e-mail) než má v nástupu, upozorní se na to Personální oddělení v notifikačním e-mailu a informace se zapíše i do historie dokumentu v appce.
- **Automatické předvyplnění společných údajů** mezi osobním a mzdovým dotazníkem – když je jeden z nich už vyplněný, druhý nabídne převzetí shodných údajů (jméno, rodné příjmení, rodinný stav, datum a místo narození, rodné číslo, státní občanství, adresa trvalého pobytu) jedním kliknutím, stále editovatelné.
- **Nový sloupec „Nástupní dokumenty" v přehledu Nástupů** – u každého ze tří dokumentů (čestné prohlášení, osobní dotazník, mzdový dotazník) barevná ikonka a jeho název rovnou v tabulce, bez nutnosti otvírat detail; přesný stav (zasláno/vyplněno/vypršelo) se zobrazí po najetí myší. Barvy jsou sjednocené i v modálním okně Dokumenty: červená = vypršelo, oranžová = zasláno a čeká na vyplnění, zelená = zasláno a vyplněno, šedá = zatím nezasláno.
- **Osobní dotazník** – „Stát narození" je nově výběr ze seznamu zemí (dřív volný text), telefon kontaktní osoby má předvolbu země stejně jako hlavní telefonní pole.
- **Čestné prohlášení** – „Typ výkonu práce" zabírá celou šířku řádku a doplněno chybějící pole „Jiné" pro upřesnění; „Zaměstnavatel" sjednocen na stejný typ pole jako „Název pracovní pozice"; „Popis pracovní činnosti" přejmenováno na „Druh práce" s vysvětlující poznámkou.
- **E-maily pro HR a mzdovou účtárnu o vyplněném dokumentu** předělané na standardní branding appky (dřív měly zjednodušený vzhled neodpovídající ostatním e-mailům).
- **Kombinovaný měsíční report** – podpora více vlastních e-mailů najednou u „Vlastní e-mail" (dřív jen jeden), modální náhled skutečného seznamu příjemců pro „Vybraná skupina" a „Všichni zaměstnanci".
- **Vyjádření tajemníka u vyhodnocení zkušební doby** – komentář je nově povinný při volbě „Nesouhlasím", podpis vedoucího i tajemníka má stejný formát „Elektronicky podepsáno: jméno, datum" jako u nástupních dokumentů.

### Opravy

- **Skutečná oprava přetékání dlouhého textu v PDF** u všech tří nástupních dokumentů – zalamování textu dřív fungovalo jen mezi slovy; pokud bylo jedno „slovo" (nebo nepřerušený řetězec znaků) samo o sobě širší než sloupec, nemělo se jak zalomit a přeteklo mimo rámeček nebo do sousedního pole. Nově se zalomí i uvnitř takového textu.
- Odstraněno omylem přidané duplicitní pole „Druh práce" z osobního dotazníku (patří jen do čestného prohlášení jako popis pracovní činnosti).
- **Oprava stahování PDF kombinovaného měsíčního reportu** – při delším obsahu (víc řádků, více stránek) selhávalo generování PDF na tomto počítači kvůli lokálnímu omezení Windows, které blokovalo spouštění vlastní staženého prohlížeče Puppeteru (nyní se na Windows použije systémově nainstalovaný Chrome/Edge, na produkci beze změny). Zároveň opravena chybně obarvená poslední stránka PDF (tiskový spád barvy z patičky přes celou zbylou plochu stránky u víc-stránkového obsahu) a pozadí kolem reportu v PDF je nově bílé (dřív bledě zelené na každé stránce) – zelená zůstává jen v patičce.
- **Oprava stavu dokumentu, který nebyl nikdy odeslán a mezitím mu doběhla platnost odkazu** – takový dokument se dřív tvářil jako obyčejné „Nezasláno" (šedě, bez varování), ale při pokusu o odeslání e-mailem ho appka tiše přeskočila jako vypršelý. Nově se rovnou zobrazí jako vypršelý (červeně) a nabídne se u něj „Vygenerovat nové odkazy" stejně jako u dokumentů, které vypršely až po odeslání.
- **Oprava „Nový odkaz"/„Vygenerovat nové odkazy" mylně zobrazujícího dokument jako už odeslaný** – obnovení odkazu dřív ponechávalo v databázi datum předchozího odeslání, takže se nový (ještě neodeslaný) odkaz tvářil jako „Zasláno, čeká na vyplnění" (oranžově). Nově se datum odeslání při obnově odkazu vymaže, takže dokument správně ukazuje „Nezasláno" (šedě), dokud se opravdu neodešle znovu.
- **Sekce „Odeslat odkaz na vybrané dokumenty e-mailem"** po obnově odkazu (jednoho i hromadně u vypršelých) nově automaticky vybere k odeslání jen ten dokument, který se právě obnovil (dřív zůstávaly zaškrtnuté i jiné, s obnovou nesouvisející dokumenty) a okno se k této sekci samo posune i při obnově jednoho dokumentu (dřív jen u hromadné obnovy). Sekce navíc zobrazuje i dokumenty, které ještě vůbec nebyly vygenerovány (šedě, s popiskem), a u vygenerovaných ukazuje stejný přesný a barevně odlišený stav jako sloupec „Nástupní dokumenty".
- **Oprava neaktualizující se ikonky ve sloupci „Nástupní dokumenty"** – obnovení odkazu, reset dat nebo odeslání e-mailu v okně „Dokumenty" se dřív neprojevilo v přehledu Nástupů, dokud se stránka ručně neobnovila. Nově se přehled po každé takové akci sám aktualizuje.
- **PDF ke stažení kombinovaného měsíčního reportu se nově generuje na šířku (landscape)** – tabulky mají víc místa a jsou přehlednější. Šířky sloupců (širší sloupec se jménem) i zákaz dělení řádku a opakování záhlaví tabulky na každé stránce se řeší jen při generování PDF (přímo v Puppeteru), takže se to netýká vzhledu skutečně zasílaných e-mailů – ty zůstávají na původním, ověřeném rozložení, které funguje spolehlivě na malých i velkých obrazovkách ve všech e-mailových klientech. Opravena i buňka „Přidat do kalendáře", která v PDF s užším sloupcem přetékala mimo ohraničení tabulky (text se v PDF nyní zalomí).
- **Oprava e-mailových připomínek k nástupním dokumentům, které se po obnově odkazu už nikdy neposlaly znovu** – všechny tři automatické připomínky (zaměstnanci před vypršením, HR po vypršení, HR na nezaslané) si „už bylo upozorněno" pamatovaly natrvalo podle ID dokumentu, takže po vygenerování nového odkazu (a novém běhu stejného cyklu odeslání/vypršení) by se stejná připomínka podruhé v životě dokumentu už neposlala. Nově se počítání připomínek při každém vygenerování nového odkazu vynuluje.

### Ostatní

- **Automatizace k vyhodnocení zkušební doby je dočasně vypnutá** – bude nově řešena přes jinou aplikaci. Cron endpoint `/api/cron/probation-notifications` na stejném denním spouštění nově hlídá jen vypršení odkazů k vyplnění nástupních dokumentů (viz výše). E-mailové šablony a zbytek logiky k vyhodnocení zkušební doby (finální PDF, vyjádření tajemníka) zůstávají funkční a dál se používají při ručním odeslání, jen se automaticky nezakládají nové pozvánky/připomínky k vyplnění.

Žádná nová databázová migrace není v této verzi potřeba.

---

## Deployment checklist k verzi 0.14.0

- [ ] Žádné nové migrace nejsou potřeba.
- [ ] Ověřit, že se denní cron (`/api/cron/probation-notifications`) spouští dál – nyní zakládá jen připomínky k vypršení odkazů nástupních dokumentů, ne pozvánky ke zkušební době.
- [ ] Vyzkoušet odeslání odkazu k vyplnění, nechat ho vypršet (nebo ručně upravit datum v DB) a ověřit zobrazení upozornění i tlačítko hromadné obnovy.
- [ ] Vygenerovat PDF u všech tří nástupních dokumentů s velmi dlouhým textem (i bez mezer) v libovolném poli a ověřit, že nepřeteče.
- [ ] Odeslat kombinovaný měsíční report na více vlastních e-mailů najednou a ověřit zobrazení náhledu příjemců pro skupinové odeslání.
- [ ] Vyzkoušet vyjádření tajemníka s volbou „Nesouhlasím" bez komentáře – má vyžadovat jeho vyplnění.
- [ ] Stáhnout PDF kombinovaného měsíčního reportu s vyšším počtem řádků (víc stránek) a zkontrolovat, že poslední stránka není celá zbarvená.
- [ ] Ověřit, že Personální oddělení dostane e-mail i na nástupní dokumenty, které ještě nebyly vůbec odeslány (ne jen na vypršelé).
- [ ] Vytvořit dokument, nechat ho 14+ dní neodeslaný, a ověřit, že se zobrazí červeně jako vypršelý (ne šedě jako „Nezasláno").
- [ ] Obnovit odkaz u jednoho dokumentu a ověřit, že se zobrazí šedě jako „Nezasláno" (ne oranžově jako už odeslaný) a že se ikonka v přehledu Nástupů hned změní bez ručního obnovení stránky.
- [ ] Stáhnout PDF kombinovaného měsíčního reportu se sloupcem „Kalendář" a zkontrolovat, že text odkazu na kalendář nepřetéká mimo ohraničení tabulky.
- [ ] Nechat vypršet stejný dokument dvakrát po sobě (odeslat, nechat vypršet, obnovit odkaz, znovu odeslat, znovu nechat vypršet) a ověřit, že HR dostane připomínku i podruhé, ne jen při prvním cyklu.

---

## 0.13.0 – 2026-09-14

### Nové funkce

- **Redesign tří nástupních dokumentů (čestné prohlášení, osobní dotazník, dotazník pro mzdovou agendu)** – obsahová i vizuální restrukturalizace podle skutečné potřeby HR: čestné prohlášení dostalo nové pole „Název pracovní pozice" u praxe, všech 7 sekcí (vojenská služba, neplacené volno, mateřská/rodičovská, trvalá péče o dítě, péče o zdravotně postižené dítě, péče o osobu blízkou, doktorské studium) je nově schované za přepínač Ano/Ne místo vždy zobrazených polí a závěrečná poučka je vizuálně zvýrazněná tučně. Osobní dotazník má přeuspořádanou sekci Základní údaje (rodné příjmení nově povinné, přepínač „jiné příjmení než rodné", rodinný stav přesunut výš), podmíněnou kartu „Povolení k pobytu" jen pro cizí státní příslušníky, nové povinné pole e-mail a přepínač pro odlišnou doručovací adresu, sloučené sekce kontaktů/vzdělání/doplňujících údajů a zrušené mzdové položky (přesunuté jen do dotazníku pro mzdovou agendu). Státní občanství, banka a zdravotní pojišťovna se nově vybírají ze seznamu (s možností „Jiná, vypište") místo volného textu.
- **Přepracovaný generátor PDF pro všechny tři dokumenty** – PDF nově zobrazuje úplně všechna pole formuláře (i prázdná nepovinná, s hodnotou „Nevyplněno"), takže z PDF je vždy jasně vidět, co bylo a co nebylo vyplněné. Sekce v PDF byly sjednoceny přesně podle karet na obrazovce (u osobního dotazníku z cca 13 drobných sekcí na 6 přehledných A–F sekcí s podkartami), D. Osvědčení má zpátky plné znění právních otázek, doručovací adresa se zobrazuje vždy (buď konkrétní adresa, nebo „Shodná s adresou trvalého pobytu") a rodné příjmení se v PDF zobrazí, jen když se skutečně liší od aktuálního.
- **Barva Prahy 6 (#00847C)** na hlavních odesílacích tlačítkách čestného prohlášení, osobního dotazníku, dotazníku pro mzdovou agendu a formuláře praxe, a v barvě načítacího indikátoru vnitřní aplikace.
- **Vizuální rebrand chybových a přístupových stránek** (404, obecná chybová stránka, „Nemáte oprávnění") na nové ilustrace Prahy 6 a přehlednější texty; sjednocený favicon set a manifest pod `/assets/favicons/`.
- **Popisek typu zaměstnanecké změny nově odpovídá skutečnému rozdílu** (např. „Změna příjmení a titulu" místo obecného „Změna jména") a je sjednocený napříč přehledem, filtrem, detailem, historií, statistikami, PDF i e-mailovými reporty (sdílené funkce v `employment-linking.ts`).
- **Vylepšené e-mailové reporty zaměstnaneckých změn** – spolehlivější a čitelnější rozložení tabulky změn na počítači i na mobilu (pevná šířka sloupců, mobilní zalomení bez lámání slov uprostřed), sloupec „Kalendář" jen tam, kde je relevantní (mateřská dovolená), sloupec „Zaměstnanec" ve všech reportech ukazuje osobní číslo pod jménem bez zbytečného opakování ve „Aktuální zařazení".
- **Odkaz „Přidat do kalendáře" zjednodušen na jediný Google Calendar odkaz** u všech jednotlivých řádků (dřív dvě varianty – Google a univerzální .ics) napříč celou appkou; společná .ics příloha pro hromadný import více událostí najednou zůstává beze změny.
- **Ruční tlačítko „Poslat tajemníkovi"** na detailu vyhodnocení zkušební doby – umožní žádost o vyjádření tajemníkovi znovu odeslat (např. při chybě doručení), dokud tajemník své vyjádření sám neodešle.
- **PDF vyhodnocení zkušební doby** – sekce 1.–4. (pracovní výsledky, pracovní chování, sociální chování a spolupráce, dovednosti/znalosti/vlastnosti) i doplňkové poznámky (předčasné ukončení, stanovisko tajemníka při shodě s vedoucím) mají nově ohraničený rámeček stejným stylem jako box doporučení vedoucího/tajemníka.
- Sjednocený název procesu **„Vyhodnocení zkušební doby"** napříč celou appkou (kód, UI texty i dokumentace) – dřív se na řadě míst nekonzistentně používalo kratší „Hodnocení zkušební doby".

### Opravy

- **Kritická oprava odesílání kombinovaného měsíčního reportu** – souběžné zápisy do stejného řádku `MonthlyReport` mohly při odeslání většího množství záznamů shodného měsíce/typu shodit chybu MySQL 1020 („Record has changed since last read"); zápis stavu odeslání je teď jednorázový na konci, ne opakovaně uvnitř `Promise.all`.
- **Oprava hromadného odesílání „Poslat vše" v přehledu dokumentů** – dřív se vyplněné dokumenty posílaly ve více samostatných e-mailech místo jednoho, a do odeslání se chybně počítaly i nevyplněné/rozpracované dokumenty (které lze poslat jen jako odkaz). Nově jde jedním e-mailem jen o vyplněné dokumenty, nevyplněné se posílají jen jednotlivě.
- Oprava PDF hlavičky, kde se u osobního dotazníku a dotazníku pro mzdovou agendu ztrácely tituly před/za jménem v hlavičce, pokud formulář neměl vyplněné příjmení (fallback nebyl zabalený do titulů stejně jako běžná cesta).
- Oprava chybně se zobrazujícího „Odpověď: Nevyplněno" pod čistě popisnou větou bez skutečné otázky (žádost o zaslání mzdy na bankovní účet).
- Dlouhé příjmení se v přehledu Dokumentů už nezobrazuje oříznuté (`truncate` nahrazeno zalomením).
- Název sekce A dotazníku pro mzdovou agendu v PDF opraven na „Základní údaje zaměstnance" podle nadpisu karty na obrazovce.
- Drobné opravy rozložení filtru typu změny (celý popisek se teď v dropdownu nezobrazuje oříznutý) a tabulky Změn (širší sloupce, zalomení místo oříznutí).

Žádná nová databázová migrace ani proměnná prostředí není v této verzi potřeba.

---

## Deployment checklist k verzi 0.13.0

- [ ] Žádné nové migrace, proměnné prostředí ani npm závislosti nejsou potřeba.
- [ ] Vygenerovat PDF u všech tří nástupních dokumentů (i staršího, dříve vyplněného záznamu) a ověřit, že se nezobrazí chyba a že prázdná nepovinná pole ukazují „Nevyplněno".
- [ ] Ověřit, že „Poslat vše" v přehledu Dokumentů pošle vyplněné dokumenty jedním e-mailem a přeskočí nevyplněné.
- [ ] Odeslat kombinovaný měsíční report s více záznamy ve stejném měsíci/typu a ověřit, že neskončí chybou 1020.
- [ ] Zkontrolovat popisek typu změny na přehledu, filtru, detailu i v odeslaném PDF/e-mailovém reportu – má odpovídat reálnému rozdílu (jméno/příjmení/titul vs. pozice/odbor).
- [ ] Na detailu vyhodnocení zkušební doby vyzkoušet tlačítko „Poslat tajemníkovi" a zkontrolovat vygenerované PDF s novými ohraničenými sekcemi.
- [ ] Projít error/404/no-access stránky a favicon po nasazení (nové cesty pod `/assets/favicons/`).

---

## 0.12.0 – 2026-08-27

### Nové funkce

- **Kontaktní údaje u zaměstnaneckých změn** – e-mail zaměstnance a jméno/e-mail vedoucího odboru, s automatickým dohledáním vedoucího podle pozice (stejný mechanismus jako u nástupů/odchodů) i ručním přepsáním nebo vyhledáním v EOS. Zobrazuje se jako nové sloupce „Kontakt" a „Vedoucí" v přehledu Změn a jako samostatná karta na detailu záznamu (v e-mailových reportech se nezobrazuje).
- **Vyhledávání v ručním režimu u odchodu** – po zaškrtnutí „Vyplnit vlastní data" jde nově navíc vyhledat osobu i pozici v EOS/systemizaci (předvyplní jméno/kontakt a pozici/zařazení), pole pak zůstávají volně editovatelná. Dřív bylo vyhledávání dostupné jen při plném výběru zaměstnance z EOS.
- **Sjednocené a spolehlivé vyhledávání osob i pozic** napříč nástupy, odchody i změnami – konzistentní chování s diakritikou i bez ní, okamžité hledání při psaní a plynulé donačítání dalších výsledků při scrollování u velkých seznamů (dřív mohlo v některých dialozích donačítání tiše nefungovat).
- **Oprava návrhu dalšího osobního čísla u nástupů** – počítá se teď správně jen se 4místnou řadou čísel úřadu; 5místná a delší čísla (KITT6 a další organizace) se do návrhu už nepletou. Zobrazují se ale nadále informačně zvlášť, viditelně barevně odlišená.
- **„Nevyužitá osobní čísla"** (dřív „Přeskočená čísla") se teď při každém zobrazení ověřují živě proti aktuálnímu seznamu v EOS i proti evidenci appky, ne jen podle dřív uložené historie – odstraní se tak i čísla, která byla mezitím použita mimo tuto appku.
- Pokud appka eviduje novější osobní číslo, které se ještě neobjevuje v EOS (typicky krátce po zapsání), zobrazí se u něj upozornění „zatím jen v aplikaci, ještě není v EOS".
- **Vyhledávání vedoucího odboru přidáno i do formuláře odchodu** (dřív dostupné jen u nástupů a u zaměstnaneckých změn) – dohledá se automaticky podle pozice, jde přepsat ručně nebo znovu vyhledat v EOS.
- **Tlačítko/odkaz „Přidat do kalendáře"** (Google kalendář i univerzální soubor .ics pro Outlook a Apple Kalendář) u všech e-mailů, kde je po někom vyžadovaná akce k určitému datu: řádky v měsíčních i kombinovaných reportech (nástup, odchod, odchod na mateřskou dovolenou), pozvánky a připomínky k podpisu výstupního listu, pozvánky a připomínky k vyhodnocení zkušební doby. U reportů s více lidmi navíc celý e-mail dostane i jednu souhrnnou přílohu .ics se všemi událostmi najednou pro hromadné přidání do kalendáře.
- Zaměstnanecká změna „Odchod na mateřskou dovolenou" je teď plně zapojená i do Statistik (graf podle typu, PDF export), do e-mailových reportů (filtr typu, sloupec v PDF) a do historie/auditní stopy.

### Opravy

- Formulář Změny: chybová hláška „vyberte alespoň jednu oblast změny" se už neváže na konkrétní zaškrtávátko (dřív zůstávalo červené jen první políčko) a zobrazuje se správně přímo pod datem účinnosti.
- Opravena nespolehlivost vyhledávání zaměstnanců v EOS napříč appkou – chybný interní trik (`q=1`) pro „načíst všechny" ve skutečnosti spouštěl úzký číselný filtr a mohl vracet neúplné výsledky; nahrazeno vlastním parametrem pro skutečné načtení celého seznamu.
- Auditní historie u zaměstnanecké změny teď rozlišuje reálného uživatele od automatizace (cronu) – dřív bylo u vytvoření záznamu vždy uvedeno „Systém", i když ho založil konkrétní člověk.
- Zobrazení „Odchod na mateřskou dovolenou" restylováno na méně výrazný vzhled (sjednoceno se stylem ostatních typů změn) v přehledu, na detailu, v okně propojených záznamů i v e-mailu.
- Drobné sjednocení vzhledu karty „Vedoucí odboru" u formulářů nástupu, odchodu i změny (tlačítko „Obnovit dle pozice" se dřív mohlo vizuálně zúžit vedle delšího popisku).

Tato verze přidává dvě nové databázové migrace: `20260824143351_add_maternity_leave_change_type` (nová hodnota `MATERNITY_LEAVE` v enumu typu zaměstnanecké změny) a `20260827110811_add_employee_change_contact_and_supervisor` (nové sloupce `userEmail`, `supervisorName`, `supervisorEmail` u zaměstnanecké změny). Žádná nová proměnná prostředí není potřeba – nový endpoint `/api/kalendar/ics` je bez přihlášení, stejně jako už dřív existující veřejné odkazy na výstupní listy.

---

## Deployment checklist k verzi 0.12.0

- [ ] **Dvě nové migrace.** Spustit `prisma migrate deploy` (v pořadí `add_maternity_leave_change_type`, `add_employee_change_contact_and_supervisor`), poté `prisma generate` a restart/redeploy aplikace.
- [ ] Žádné nové proměnné prostředí ani npm závislosti nejsou potřeba.
- [ ] Na testovací zaměstnanecké změně ověřit: kontakt (e-mail) a vedoucí odboru (jméno/e-mail, i automatické dohledání podle pozice) se uloží a zobrazí ve sloupcích „Kontakt"/„Vedoucí" v přehledu i na kartě na detailu.
- [ ] U odchodu v režimu „Vyplnit vlastní data" ověřit, že vyhledání osoby i pozice předvyplní pole a jde je dál upravit.
- [ ] Ověřit, že návrh osobního čísla u nástupu ignoruje 5místná speciální čísla a že „Nevyužitá osobní čísla" v popoveru skutečně nejsou obsazená ani v EOS, ani v appce.
- [ ] Otevřít odeslaný report e-mail (kombinovaný i samostatný) a zkontrolovat odkaz „Přidat do kalendáře" u jednotlivých řádků i přiloženou souhrnnou přílohu `.ics`.
- [ ] Zkontrolovat, že se „Odchod na mateřskou dovolenou" správně zobrazuje v grafu a PDF exportu Statistik.

## 0.11.0 – 2026-08-14

### Nové funkce

- **Nové okno "Osoby k podpisu" u výstupního listu** (dřív "Příjemci k podpisu") – samostatný přehled, kdo aktuálně smí a má podepsat daný výstupní list (kdo, kdy dostal pozvánku, případně "v zastoupení za koho"). Doplňuje stávající "Odeslat všem k podpisu", není náhrada. Přidat nového člověka jde i rovnou "v zastoupení" (vybere se zodpovědná osoba/odbor stejně jako u "Odeslat k podpisu v zastoupení") – dostane rovnou ten odlišný e-mail s pozvánkou pro zastoupení.
- **Odebraná osoba se ze seznamu už nemaže, jen se "zruší" a jde ji kdykoliv vrátit.** V okně "Osoby k podpisu" i v "Odeslat všem k podpisu" se odebraný člověk přesune do samostatné části "Zrušení příjemci" s poznámkou, kdy byl zrušen, a tlačítkem "Vrátit" – vrácení mu obnoví právo podepisovat a přijímat připomínky, ale **neposílá se mu znovu pozvánka**. Dokud je někdo zrušený, výstupní list si přes svůj odkaz stále může zobrazit, ale vidí informaci, že byl odebrán jako osoba k podpisu a musí požádat o opětovné přidání.
- **"Odeslat všem k podpisu" má nově dvoufázový postup**: nejdřív jde přidat libovolný počet nových lidí (zaškrtnou se automaticky), a teprve tlačítkem "Odeslat vybraným" se pošle vybrané skupině – ať už poprvé, nebo znovu. U každého, komu už dřív bylo odesláno, je u něj vidět poznámka "Odesláno [datum a čas]".
- **Podpis "zaměstnanec" na veřejném odkaze výstupního listu je teď vázaný na konkrétní osobu** – dřív mohl řádek zaměstnance podepsat kdokoli přihlášený přes Google s povolenou doménou (@praha6.cz/@kitt6.cz), teď musí souhlasit přihlášený e-mail s e-mailem odcházejícího zaměstnance u daného záznamu. Ostatní řádky (vedoucí, signatáři, v zastoupení) se nemění.
- **Přístup k podpisu výstupního listu je teď vázaný na to, jestli je člověk v seznamu osob k podpisu.** Kdo je z tohoto seznamu odebraný (zrušený), nesmí nic ve výstupním listu podepsat – uvidí místo toho informaci, že byl odebrán a má požádat o opětovné přidání. Uživatelé s vyšším oprávněním než běžný USER (HR, IT, READONLY, admin) vidí a mohou podepisovat vždy, bez ohledu na to, jestli jsou v seznamu.
- **Nová verze pozvánky k podpisu přímo pro odcházejícího zaměstnance** – místo obecné "Pozvánky k podpisu výstupního listu" dostane odcházející zaměstnanec (jak při prvním odeslání, tak u automatických připomínek) e-mail v jiném znění: že jeho odchod byl zaevidován, má si vyřídit předání agendy a vrácení majetku a podepsat výstupní list, a že po podpisu všech stran dostane potvrzení a má se dostavit na Personální oddělení pro zápočtový list.
- **Vedoucí odboru je teď vidět přímo v seznamu i detailu odchodu** (dřív jen po otevření výstupního listu) – nový sloupec "Vedoucí" v tabulce Plánované i Skutečné odchody, se stejným stylem jako u Nástupů.
- **Výběr zaměstnance z EOS** (tlačítko "Vybrat ze zaměstnanců") je teď dostupný ve všech dialozích pro přidání osoby k podpisu (Odeslat všem, Odeslat k podpisu, Odeslat k podpisu v zastoupení, Osoby k podpisu, Odeslat PDF) a funguje spolehlivě i na jednoslovné/příjmení-only hledání. Výběr jen předvyplní pole jméno/e-mail k případné úpravě – teprve tlačítkem "Přidat" se člověk skutečně přidá.
- **"Odeslat všem k podpisu" umí nově přidávat lidi i "v zastoupení"** – stejně jako v okně "Osoby k podpisu" jde zaškrtnout "Přidat v zastoupení", vybrat zodpovědnou osobu/odbor a rovnou takto hromadně (spolu s ostatními) odeslat, se správným (odlišným) e-mailem pro zastoupení.
- Nejdůležitější akce u výstupního listu (Odeslat všem k podpisu, Osoby k podpisu, Uložit) mají teď zelené zvýraznění; Uzamknout je nově obyčejné tlačítko. Kliknutí na Uložit teď po úspěšném uložení okno výstupního listu i zavře.
- **Podpis "vedoucí odboru" nahoře v hlavičce a podpis u řádku "předávací protokol" jsou teď propojené** – stačí podepsat kterýkoli z obou (nebo v zastoupení) a druhý se automaticky označí jako podepsaný stejnou osobou; zrušení podpisu na jednom zruší i ten druhý. Dřív bylo potřeba podepisovat obě políčka zvlášť, přestože jde o stejnou osobu a stejný úkon. **Doladění:** propojení směrem od řádku "předávací protokol" nahoru fungovalo nespolehlivě (záviselo na tom, jestli React stihl vyhodnotit vnitřní pomocnou proměnnou dost rychle) – opraveno na spolehlivý způsob, který používá i opačný směr (z hlavičky dolů), takže teď funguje konzistentně oběma směry včetně podpisu i zrušení v zastoupení.
- Na veřejné stránce výstupního listu (`/odchody-public/[token]`) odstraněno duplicitní zobrazení jména zaměstnance hned pod nadpisem "Výstupní list" – celé jméno je stejně vidět v hlavičce dokumentu níže.

### Opravy

- **Kritická oprava: hlavní uložení výstupního listu (tlačítko "Uložit"/"Uzamknout", i automatické doukládání před generováním/odesláním PDF) mazalo uložený seznam osob k podpisu.** Uložení celého formuláře si stavělo vnitřní data znovu od nuly a nezahrnovalo do nich seznam osob k podpisu ani informaci, kdy/kým byl naposledy odeslán – takže i když už bylo někomu prokazatelně odesláno, po prvním kliknutí na "Uložit" se to v datech ztratilo a okno se vrátilo k výchozímu navrhovanému seznamu. Opraveno v obou cestách ukládání (interní i veřejný odkaz pro signatáře) – "Uložit" se teď týká skutečně jen obsahu výstupního listu (podpisy, položky, předávaná agenda, zámek), seznam osob k podpisu a historie odeslání se přenášejí beze změny.
- **Kritická oprava: stejný e-mail ve dvou různých rolích (přímo za sebe a k tomu v zastoupení za jinou osobu/odbor) se pletl dohromady.** Pokud měl někdo v seznamu dvě nezávislé role se stejnou e-mailovou adresou, zrušení nebo úprava jedné role mohla omylem smazat nebo přepsat tu druhou a v okně se zobrazovala jen jedna z nich. Opraveno tak, že se každá role eviduje samostatně podle e-mailu **a** role v zastoupení – přidání, zrušení, vrácení i automatické připomínky teď rozlišují každou roli zvlášť, a za každé jiné zastoupení chodí vlastní e-mail, i když jde o stejnou osobu.
- **Návrh výchozího seznamu (než se poprvé opravdu někomu odešle) se už neukládá jako skutečný seznam.** Dřív, když HR z navrhovaného výchozího seznamu někoho jen odebrala nebo odeslala jen části lidí ještě před prvním skutečným odesláním, uložil se do databáze celý návrh (včetně nikdy neodeslaných lidí, případně jako "zrušení"). Teď se do skutečného, uloženého seznamu dostane vždy jen ten, komu už byla pozvánka opravdu odeslána. Jakmile jednou někomu reálně odejde pozvánka (přes kteroukoli ze tří cest – Odeslat všem, Odeslat k podpisu, Odeslat k podpisu v zastoupení), přestane se při dalším otevření "Odeslat všem k podpisu" nabízet výchozí návrh a zobrazí se rovnou skutečný seznam.
- Opravena duplicita v navrhovaném výchozím seznamu, když je odcházející zaměstnanec zároveň jedna z pevně nastavených kontaktních osob pro podpis (např. ředitel KITT6) – jeho e-mail se v seznamu objevoval dvakrát, což ho kvůli tomu mohlo v zobrazení "ztratit".
- Opravena souběžnost při odesílání více pozvánek najednou tlačítkem "Odeslat vybraným" – souběžné požadavky si mohly navzájem přepsat uložený seznam příjemců a část přidání se ztratila; odesílání je teď sériové a chyba při ukládání seznamu se už nezamlčí (zobrazí se upozornění).
- **"Odeslat všem k podpisu" u výstupního listu si teď skutečně pamatuje naposledy uložený seznam příjemců** – dřív se okno při každém otevření vždy vrátilo k výchozímu navrhovanému seznamu (zaměstnanec + vedoucí + signatáři), takže nešlo poznat, kdo je opravdu uložený a podle koho se řídí automatické připomínky. Okno teď při otevření načte aktuální uložený seznam (včetně toho, kdy a kým byl naposledy potvrzen) a teprve když ještě žádný neexistuje, nabídne výchozí návrh k úpravě. Ke stejnému seznamu se navíc nově automaticky přidá i každý, komu se pošle samostatná pozvánka tlačítkem "Odeslat k podpisu" nebo "Odeslat k podpisu v zastoupení" (dřív se do seznamu, podle kterého jede automatizace, vůbec nedostali) – žádná z těchto akcí zbytek seznamu nemaže, jen do něj přidává. U podpisu v zastoupení se navíc nově eviduje i konkrétní řádek/y, za které daný člověk podepisuje, takže se cílené připomínky i vyhodnocení "už podepsáno" počítají správně i pro lidi přidané v zastoupení, a jejich e-mailové připomínky mají správné znění ("v zastoupení za…"), ne obecné.
- Podpisy (výstupní list i vyhodnocení zkušební doby) se teď snaží dohledat celé jméno s tituly i pro uživatele, kteří nemají titul vyplněný přímo ve svém účtu, přes dohledání podle e-mailu v EOS. **Známé omezení:** tohle pomůže jen zaměstnancům vedeným v EOS Prahy 6 – pro zaměstnance KITT6, kteří v EOS nejsou, správa uživatelů v adminovi zatím neumožňuje tituly editovat, takže u nich se titul u podpisu stále nemusí zobrazit; oprava (editace titulů v adminovi) je naplánovaná.
- **Editace odchodu (ze seznamu Odchodů, z Přehledu i z detailu odchodu) přepisovala ručně uloženého vedoucího odboru čerstvě dohledaným podle pozice.** Formulář při otevření editace nedostával uložené jméno/e-mail (ani pozici/odbor/útvar) vedoucího vůbec předané, takže je viděl jako prázdné a automaticky spustil nové dohledání – i když měl odchod ručně nastaveného jiného vedoucího. Opraveno na všech třech místech; samostatná stránka `/odchody/[id]/editovat` tímto problémem netrpěla.

Tato verze nepřidává žádnou novou databázovou migraci ani proměnnou prostředí (nová data se ukládají do stávajícího JSON pole `ExitChecklist.header`).

---

## Deployment checklist k verzi 0.11.0

- [ ] **Žádná nová migrace.** Stačí nasadit kód a restartovat/redeploy aplikaci.
- [ ] Vyzkoušet na testovacím odchodu okno "Osoby k podpisu" – zobrazení seznamu, zrušení osoby (i s ověřením, že jí pak cron při ručním spuštění s `force=true` už nepošle připomínku), vrácení zrušené osoby zpět (bez nové pozvánky) a přidání nové osoby, včetně "v zastoupení" (dorazí jí pozvánka).
- [ ] Ověřit, že po kliknutí na "Uložit" ve výstupním listu zůstává seznam osob k podpisu i historie odeslání beze změny (dřív se mazaly).
- [ ] Vyzkoušet, že stejná osoba (stejný e-mail) přidaná jednou přímo a jednou v zastoupení funguje jako dvě nezávislé role – zrušení jedné neovlivní druhou a chodí jim oddělené připomínky.
- [ ] Ověřit, že se "Odeslat všem k podpisu" při opětovném otevření vrátí k naposledy uloženému seznamu, ne k výchozímu návrhu – a že návrh, ze kterého se nikomu ještě neodeslalo, se do databáze neukládá.
- [ ] Vyzkoušet podpis zaměstnance na veřejném odkaze pod jiným (i povoleným) účtem, než má odcházející zaměstnanec – řádek by se neměl dát podepsat.
- [ ] Zkontrolovat, že nová verze e-mailu chodí odcházejícímu zaměstnanci (jak při prvním odeslání, tak u připomínky) a "v zastoupení" verze lidem přidaným v zastoupení.
- [ ] Zkontrolovat, že je sloupec "Vedoucí" vidět u Odchodů (Plánované i Skutečné).
- [ ] Vyzkoušet přidání "v zastoupení" přímo v "Odeslat všem k podpisu" (ne jen v "Osoby k podpisu") a hromadné odeslání spolu s ostatními.
- [ ] Podepsat jako vedoucí odboru buď horní podpis, nebo řádek "předávací protokol" – ověřit, že se označí i to druhé políčko (a že zrušení jednoho zruší i druhé).
- [ ] Zkontrolovat veřejný odkaz výstupního listu – jméno zaměstnance by se mělo zobrazovat jen jednou (v hlavičce dokumentu, ne ještě jednou pod nadpisem stránky).

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
- **"Odeslat všem k podpisu" u výstupního listu si teď skutečně pamatuje naposledy uložený seznam příjemců** – dřív se okno při každém otevření vždy vrátilo k výchozímu navrhovanému seznamu (zaměstnanec + vedoucí + signatáři), takže nešlo poznat, kdo je opravdu uložený a podle koho se řídí automatické připomínky. Okno teď při otevření načte aktuální uložený seznam (včetně toho, kdy a kým byl naposledy potvrzen) a teprve když ještě žádný neexistuje, nabídne výchozí návrh k úpravě. Ke stejnému seznamu se navíc nově automaticky přidá i každý, komu se pošle samostatná pozvánka tlačítkem "Odeslat k podpisu" nebo "Odeslat k podpisu v zastoupení" (dřív se do seznamu, podle kterého jede automatizace, vůbec nedostali) – žádná z těchto akcí zbytek seznamu nemaže, jen do něj přidává. U podpisu v zastoupení se navíc nově eviduje i konkrétní řádek/y, za které daný člověk podepisuje, takže se cílené připomínky i vyhodnocení "už podepsáno" počítají správně i pro lidi přidané v zastoupení, a jejich e-mailové připomínky mají správné znění ("v zastoupení za…"), ne obecné. Přidání dalšího příjemce (v okně "Odeslat všem" i v obou dialozích pro jednotlivé pozvánky a v "Odeslat PDF") jde nově i tlačítkem "Vybrat ze zaměstnanců" místo ručního vypisování jména a e-mailu.
- **Podpis "zaměstnanec" na veřejném odkaze výstupního listu je teď vázaný na konkrétní osobu** – dřív mohl řádek zaměstnance podepsat kdokoli přihlášený přes Google s povolenou doménou (@praha6.cz/@kitt6.cz), teď musí souhlasit přihlášený e-mail s e-mailem odcházejícího zaměstnance u daného záznamu. Ostatní řádky (vedoucí, signatáři, v zastoupení) se nemění.
- **Nová verze pozvánky k podpisu přímo pro odcházejícího zaměstnance** – místo obecné "Pozvánky k podpisu výstupního listu" dostane odcházející zaměstnanec (jak při prvním odeslání, tak u automatických připomínek) e-mail v jiném znění: že jeho odchod byl zaevidován, má si vyřídit předání agendy a vrácení majetku a podepsat výstupní list, a že po podpisu všech stran dostane potvrzení a má se dostavit na Personální oddělení pro zápočtový list.
- **Vedoucí odboru je teď vidět přímo v detailu odchodu** (dřív jen po otevření výstupního listu).

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
