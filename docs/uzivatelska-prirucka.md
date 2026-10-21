# Uživatelská příručka – On/Off-boarding aplikace

Interní HR aplikace Úřadu městské části Praha 6 (a příspěvkové
organizace KITT6) pro evidenci nástupů, odchodů a zaměstnaneckých
změn, správu souvisejících dokumentů, žádosti o pracovnělékařskou
prohlídku a pravidelné reportování. (Vyhodnocení zkušební doby je od
verze 0.15.0 vypnuté – agendu přebírá Systemizace.)

Tato příručka je psaná tak, aby se dala použít i jako **podklad pro
školení nových kolegů z HR** – vysvětluje krok za krokem, jak se která
činnost v aplikaci dělá, ne jen co aplikace obecně umí. Kdo aplikaci
teprve poznává, může projít kapitoly popořadě; kdo hledá konkrétní
postup, použije obsah nebo `Ctrl+F`.

## Obsah

1. [Rychlý start](#1-rychlý-start)
2. [Přístup do aplikace](#2-přístup-do-aplikace)
3. [Role a oprávnění](#3-role-a-oprávnění)
4. [Přehled adres (URL)](#4-přehled-adres-url)
5. [Moduly aplikace – postup krok za krokem](#5-moduly-aplikace--postup-krok-za-krokem)
6. [Veřejné odkazy pro zaměstnance a nadřízené](#6-veřejné-odkazy-pro-zaměstnance-a-nadřízené)
7. [Historie, auditní stopa a smazané záznamy](#7-historie-auditní-stopa-a-smazané-záznamy)
8. [Časté otázky (FAQ) pro školení](#8-časté-otázky-faq-pro-školení)
9. [Slovníček pojmů](#9-slovníček-pojmů)

## 1. Rychlý start

Pro nového HR kolegu, který se do aplikace přihlásil poprvé a potřebuje
rychle pochopit, kde co je:

1. **Domovská obrazovka** je `/prehled` – kalendář se všemi nástupy a
   odchody. Odsud se dá i rovnou založit nový záznam kliknutím do
   volného dne.
2. V levém postranním menu jsou tři hlavní agendy pod sebou:
   **Nástupy**, **Odchody**, **Změny** – to je 90 % běžné denní práce.
3. Sekce **Nástroje** (níž v menu) obsahuje **Dokumenty** (přehled a
   správa dokumentů zaměstnanců), **Statistiky** a (jen pro
   administrátora) **Nastavení**.
4. Naprostá většina práce s konkrétním zaměstnancem probíhá tak, že si
   HR otevře jeho nástup/odchod a odsud dál řídí dokumenty, žádost
   o pracovnělékařskou prohlídku nebo výstupní list – nejde o
   samostatné, nesouvisející moduly, ale o „podstránky“ konkrétního
   nástupu/odchodu.
5. Cokoliv, co má vyplnit **sám zaměstnanec nebo jeho nadřízený** (bez
   přístupu do vnitřní aplikace), se řeší přes **veřejný odkaz zaslaný
   e-mailem** – viz kapitola 6.
6. Kdo si není jistý, co smí dělat, najde přesný přehled v kapitole 3.

Napříč aplikací se důsledně rozlišuje **plánovaný** a **skutečný**
stav. Plánovaný údaj popisuje, co se má stát (např. plánovaný nástup),
skutečný údaj popisuje, co se doopravdy stalo a bylo v aplikaci
potvrzeno (např. skutečný nástup). Toto rozlišení se promítá do
evidence, kalendáře, reportů i do toho, kdy přesně se spouští
automatické upomínky (viz kapitola 5).

## 2. Přístup do aplikace

Přihlášení probíhá výhradně přes **Google účet** organizace, tlačítkem
„Přihlásit se přes Google“ na úvodní obrazovce (`/signin`). Aplikace
nemá samostatné heslo ani registraci.

Přihlásit se může pouze účet z povolené domény:

- **@praha6.cz** – organizační doména úřadu.

Účty z jiných domén (včetně @kitt6.cz) se přihlásit nemohou, dokud to
administrátor v konfiguraci aplikace výslovně nepovolí.

Nová osoba z povolené domény, která se přihlásí poprvé, dostane
výchozí roli **USER** – tedy bez přístupu do vnitřní části aplikace,
dokud jí administrátor roli ručně nezvýší (viz kapitola 3). Pokud se
takový uživatel pokusí vstoupit do aplikace, uvidí stránku „Nemáte
přístup do aplikace“ s pokynem kontaktovat administrátorku aplikace.

Jméno a příjmení se při prvním přihlášení automaticky převezme z
Google účtu. Administrátor je pak může u kteréhokoli uživatele
v sekci _Administrace_ kdykoli ručně doplnit nebo opravit (viz
kapitola 3).

## 3. Role a oprávnění

Roli přiděluje **administrátor** v sekci _Administrace_
(`/admin`, dostupná jen roli ADMIN). Aplikace rozlišuje pět rolí:

| Role         | Typický uživatel       | Přístup do vnitřní aplikace                                  |
| ------------ | ---------------------- | ------------------------------------------------------------ |
| **ADMIN**    | Správce aplikace       | Ano – neomezený, včetně správy uživatelů a rolí              |
| **HR**       | Personální oddělení    | Ano – plný rozsah běžné agendy                               |
| **IT**       | IT oddělení            | Ano – běžná agenda, s menším rozsahem u dokumentů (viz níže) |
| **READONLY** | Vedení, kontrolní role | Ano – hlavně prohlížení, částečně i odesílání                |
| **USER**     | Ostatní zaměstnanci    | Ne – pouze veřejné odkazy zaslané e-mailem                   |

### Přehled oprávnění podle modulů

„Č“ = čtení/prohlížení, „Č + Z“ = čtení i zápis (vytváření, úpravy,
odesílání e-mailů), „–“ = žádný přístup.

| Modul                                                              | ADMIN | HR    | IT    | READONLY | USER    |
| ------------------------------------------------------------------ | ----- | ----- | ----- | -------- | ------- |
| Přehled (kalendář)                                                 | Č + Z | Č + Z | Č + Z | Č        | –       |
| Nástupy / Odchody                                                  | Č + Z | Č + Z | Č + Z | Č        | –       |
| Zaměstnanecké změny                                                | Č + Z | Č + Z | Č + Z | Č        | –       |
| Interní dokumenty – prohlížení a odeslání PDF                      | Č + Z | Č + Z | Č + Z | –        | –       |
| Interní dokumenty – přiřazení, zámek, znovu-vygenerování           | Č + Z | Č + Z | –     | –        | –       |
| Vyhodnocení zkušební doby (interní správa) – **vypnuto od 0.15.0** | –     | –     | –     | –        | –       |
| Výstupní list (interní správa a podpis)                            | Č + Z | Č + Z | Č + Z | Podpis¹  | Podpis¹ |
| Měsíční e-mailové reporty (Nástupy/Odchody/Změny)                  | Č + Z | Č + Z | Č + Z | Č        | –       |
| Statistiky – prohlížení, export a odeslání PDF                     | Č + Z | Č + Z | Č + Z | Č + Z    | –       |
| Statistiky – uložení/smazání vlastního pohledu                     | Č + Z | Č + Z | Č + Z | –        | –       |
| Administrace (uživatelé a role)                                    | Č + Z | –     | –     | –        | –       |
| Nastavení                                                          | Č + Z | –     | –     | –        | –       |

¹ Zaměstnanec/nadřízený bez role v aplikaci má k exit checklistu
přístup pouze přes veřejný odkaz zaslaný e-mailem, ne přes vnitřní
aplikaci – viz kapitola 6. READONLY smí ve vnitřní aplikaci exit
checklist prohlížet a podepsat (typicky jako vydávající), ale ne jej
jinak spravovat (zamykat, odesílat pozvánky, upravovat příjemce
k podpisu).

### Shrnutí rolí – co kdo v praxi může dělat

- **ADMIN** – jediná role s přístupem do Administrace (správa
  uživatelů a rolí) a do Nastavení; jinak má stejná práva jako HR.
- **HR** – plný rozsah běžné agendy: zakládá a upravuje nástupy,
  odchody a změny, spravuje interní dokumenty (včetně přiřazení,
  zámku a znovu-vygenerování), žádost o pracovnělékařskou prohlídku a
  exit checklist, odesílá měsíční i statistické reporty.
- **IT** – má prakticky stejná práva jako HR u nástupů, odchodů, změn
  a exit checklistu. **Jeden rozdíl:** u
  interních dokumentů může dokumenty prohlížet a poslat hotové PDF,
  ale nemůže je přiřazovat, zamykat ani znovu generovat – to zůstává
  jen na HR a ADMIN.
- **READONLY** – prohlíží nástupy, odchody, změny a měsíční reporty,
  ale nezakládá ani needituje záznamy. U statistik smí navíc
  vygenerovat a e-mailem odeslat PDF export. U exit checklistu smí
  checklist podepsat (typicky jako vydávající majetek), ale nespravuje
  ho (nezamyká, neodesílá pozvánky k podpisu, needituje seznam
  příjemců). Měsíční e-mailové reporty z Nástupů/Odchodů/Změn READONLY
  jen čte a smí je i vidět/exportovat, ale needituje.
- **USER** – do vnitřní aplikace se vůbec nedostane; pracuje výhradně
  s jednorázovými veřejnými odkazy, které dostane e-mailem (kapitola 6).

## 4. Přehled adres (URL)

### Přihlášení

| Adresa       | Popis                           | Přístup                  |
| ------------ | ------------------------------- | ------------------------ |
| `/signin`    | Přihlášení přes Google          | Veřejné                  |
| `/no-access` | Informace o chybějícím přístupu | Přihlášené účty bez role |

### Hlavní agenda

| Adresa                                    | Popis                                                                                     | Přístup                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| `/prehled`                                | Kalendářní přehled nástupů a odchodů, výchozí stránka po přihlášení                       | ADMIN, HR, IT, READONLY |
| `/nastupy`                                | Seznam nástupů (plánované i skutečné)                                                     | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]`                           | Detail konkrétního nástupu                                                                | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]/editovat`                  | Úprava nástupu                                                                            | ADMIN, HR, IT           |
| `/nastupy/[id]/vyhodnoceni-zkusebni-doby` | Vyhodnocení zkušební doby – **vypnuto od 0.15.0** (přesměruje na informaci o Systemizaci) | –                       |
| `/odchody`                                | Seznam odchodů (plánované i skutečné)                                                     | ADMIN, HR, IT, READONLY |
| `/odchody/[id]`                           | Detail konkrétního odchodu, včetně exit checklistu                                        | ADMIN, HR, IT, READONLY |
| `/odchody/[id]/editovat`                  | Úprava odchodu                                                                            | ADMIN, HR, IT           |
| `/odchody/[id]/vystupni-list`             | Výstupní list k odchodu                                                                   | ADMIN, HR, IT, READONLY |
| `/zmeny`                                  | Seznam zaměstnaneckých změn                                                               | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]`                             | Detail konkrétní změny                                                                    | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]/editovat`                    | Úprava změny                                                                              | ADMIN, HR, IT           |
| `/dokumenty/internal/[id]`                | Interní správa dokumentu (generování, zámek, odeslání)                                    | ADMIN, HR, IT¹          |

¹ IT vidí a odešle hotové PDF, ale tlačítka pro přiřazení, zámek a
znovu-vygenerování jsou pro roli IT skrytá/needitovatelná.

### Nástroje

V postranním menu je tato skupina adres pod nadpisem **„Nástroje“**
společně s Dokumenty:

| Adresa        | Popis                                         | Přístup                 |
| ------------- | --------------------------------------------- | ----------------------- |
| `/dokumenty`  | Přehled dokumentů napříč zaměstnanci          | ADMIN, HR, IT           |
| `/statistiky` | Agregované ukazatele, grafy a vlastní pohledy | ADMIN, HR, IT, READONLY |
| `/admin`      | Správa uživatelů a jejich rolí                | ADMIN                   |
| `/nastaveni`  | Základní nastavení účtu administrátora        | ADMIN                   |

### Veřejné odkazy (bez přihlášení do vnitřní aplikace)

| Adresa                               | Popis                                                                                 | Přístup         |
| ------------------------------------ | ------------------------------------------------------------------------------------- | --------------- |
| `/dokumenty/[hash]`                  | Vyplnění osobních dokumentů zaměstnancem                                              | Odkaz z e-mailu |
| `/odchody-public/[token]`            | Vyplnění a podpis exit checklistu                                                     | Odkaz z e-mailu |
| `/vyhodnoceni-zkusebni-doby/[token]` | **Vypnuto od 0.15.0** – zobrazí jen informaci, že se formulář přesunul do Systemizace | –               |

Adresy ve tvaru `[id]`, `[hash]` a `[token]` jsou vždy vázané na
konkrétní záznam – nejde o pevné, zapamatovatelné odkazy, ale o adresy
generované aplikací pro daný nástup, odchod, dokument apod.

## 5. Moduly aplikace – postup krok za krokem

### 5.1 Přehled

Kalendář (zobrazení měsíc/týden/den) se všemi plánovanými i
skutečnými nástupy a odchody, barevně rozlišenými podle typu události.

- Kliknutím na existující událost lze **potvrdit skutečný**
  nástup/odchod, nebo otevřít záznam k úpravě.
- Kliknutím do **volného místa** v kalendáři lze rovnou založit nový
  nástup nebo odchod k danému dni.

### 5.2 Nástupy

**Jak založit nový nástup:**

1. V menu otevřít **Nástupy**, kliknout na tlačítko pro nový záznam
   (nebo kliknout do volného dne v Přehledu).
2. Vyplnit osobní číslo, jméno, pozici, odbor/oddělení a plánované
   datum nástupu. Vedoucího lze dohledat automaticky podle čísla
   funkce, nebo zadat ručně. Aplikace u osobního čísla nabízí návrh
   dalšího volného čísla v pořadí – počítá se s ním jen v rámci 4místné
   řady čísel úřadu, 5místná a delší speciální čísla (KITT6 a další
   organizace) se do návrhu nepletou, zobrazují se ale informačně
   zvlášť. Tlačítko/odkaz **„Nevyužitá osobní čísla"** vedle pole ukáže
   čísla, která nikdo dosud nepoužil ani nepoužívá (ověřuje se to živě
   proti EOS i evidenci appky, ne jen podle uložené historie).
3. Uložit – záznam se objeví v seznamu jako **plánovaný**.
4. V den skutečného nástupu (nebo když je jistý) záznam otevřít a
   potvrdit **skutečný nástup** – tím se z plánovaného stane skutečný
   a začnou se počítat termíny odvozené od skutečného data (např.
   konec zkušební doby).

Z detailu nástupu se dále řídí:

- **Interní dokumenty** – osobní dotazník, čestné prohlášení, doklady
  o vzdělání a praxi, mzdové údaje. Dokumenty lze vyplnit přímo
  v aplikaci, nebo zaměstnanci zaslat odkaz či PDF e-mailem k
  samostatnému vyplnění (kapitola 6). Osobní dotazník i dotazník pro
  mzdovou agendu mají u státního občanství, banky, zdravotní
  pojišťovny a (jen osobní dotazník) státu narození místo volného
  textu výběr ze seznamu (s možností „Jiná, vypište" pro netypickou
  hodnotu) – omezuje se tím riziko překlepů. Vygenerované PDF u všech
  tří dokumentů zobrazuje všechna pole formuláře včetně nevyplněných
  nepovinných (s hodnotou „Nevyplněno"), aby bylo na první pohled
  jasné, co ještě chybí, a jeho rozložení sekcí odpovídá 1:1 kartám na
  obrazovce.

  Sloupec **„Nástupní dokumenty"** v přehledu Nástupů ukazuje u
  každého zaměstnance ikonku a název všech tří dokumentů najednou,
  barevně podle stavu (červená = platnost odkazu vypršela, oranžová =
  zasláno a čeká na vyplnění, zelená = zasláno a vyplněno, šedá = ještě
  nezasláno a odkaz má stále čas) – přesný stav se zobrazí po najetí
  myší na ikonku, bez nutnosti otvírat detail. Pokud dokument nebyl
  odeslán vůbec (např. se na něj zapomnělo) a mezitím uplynulo 14 dní
  od jeho vytvoření, zobrazí se rovnou červeně jako vypršelý – je
  potřeba nejdřív vygenerovat nový odkaz, teprve pak ho odeslat.
  Stejné barvy vidíte i na kartě dokumentu v okně „Dokumenty" u
  nástupu, včetně data posledního odeslání.

  Pokud platnost odkazu vyprší dřív, než ho zaměstnanec vyplní,
  objeví se v okně „Dokumenty" nahoře upozornění s tlačítkem
  „Vygenerovat nové odkazy", které obnoví najednou jen dosud
  nevyplněné dokumenty (vyplněné/podepsané se nedotkne) a rovnou
  připraví e-mail k opětovnému odeslání. Odkaz po vypršení platnosti
  už nejde znovu otevřít – je vždy potřeba nový.

  Appka sama upozorní na tři situace: zaměstnance 3 dny před
  vypršením odkazu, Personální oddělení v den vypršení (pokud
  dokument pořád není vyplněný), a Personální oddělení 7 dní po
  založení záznamu nástupu (ne podle plánovaného data nástupu), pokud
  dokument ještě vůbec nebyl zaměstnanci odeslán – pokud se do dalších
  3 dnů nevyřeší, tahle třetí připomínka se opakuje každé 3 dny. První
  dvě připomínky se počítají jen od chvíle, kdy byl odkaz opravdu
  odeslán.

  Appka dále hlídá, jestli po plánovaném dni nástupu někdo v appce
  potvrdil, že zaměstnanec skutečně nastoupil – pokud ne, Personální
  oddělení dostane e-mail s výzvou ke kontrole (víc takových nástupů
  ve stejný den se sejde v jednom společném e-mailu), opakovaně každé
  3 dny, dokud se skutečný nástup nepotvrdí nebo se záznam
  nezruší/nesmaže.

  Pokud se osobní dotazník i dotazník pro mzdovou agendu vyplňují
  odděleně, appka při otevření druhého z nich nabídne převzetí
  společných údajů (jméno, rodné příjmení, rodinný stav, datum a místo
  narození, rodné číslo, státní občanství, adresa trvalého pobytu) už
  vyplněných v tom prvním – stačí potvrdit, údaje zůstávají
  editovatelné. Pokud si zaměstnanec při vyplňování zadá jiné jméno,
  příjmení, tituly nebo e-mail, než má uvedené v nástupu, upozorní se
  na to Personální oddělení v e-mailu o vyplnění i v historii
  dokumentu.

- **Vyhodnocení zkušební doby je od verze 0.15.0 úplně vypnuté** –
  agendu od 30. 10. 2026 přebírá Systemizace, která si sama rozesílá
  pozvánky i upomínky. V appce zmizelo tlačítko i karta v okně
  Dokumenty a veřejný odkaz zaměstnancům/nadřízeným zobrazí jen
  informaci, že formulář byl přesunutý jinam. Historie dříve
  vyplněných vyhodnocení (dřív, než se agenda přesunula) zůstává
  v appce dál vidět, nic se nemazalo.

- **Žádost o pracovnělékařskou prohlídku** – appka pro vstupní
  lékařskou prohlídku nového zaměstnance umí vygenerovat žádost přesně
  ve vzhledu skutečného formuláře úřadu (logo a hlavička Prahy 6),
  kterou HR vytiskne, nechá podepsat a orazítkovat a naskenovanou
  podepsanou verzi nahraje zpátky do appky. V okně Dokumenty, záložka
  **„Lékařská prohlídka"**, HR postupně vyplní:
  - **pracovní zařazení** – appka ho předvyplní podle pozice u
    nástupu, HR jen potvrdí nebo upraví,
  - **druh práce** (stručný popis pracovní činnosti) a **režim
    práce**,
  - **rizikové faktory pracovních podmínek** – Ano/Ne, při Ano i popis,
  - **kategorii práce** (1 / 2 / 2R / 3 / 4) a **profesní riziko** –
    Ano/Ne, při Ano i popis,
  - **druh prohlídky** (vstupní / periodická / mimořádná / výstupní /
    následná po skončení rizikové práce) – u všech kromě vstupní je
    navíc povinné vyplnit důvod k jejímu provedení,
  - **variantu vstupní prohlídky** – buď ÚLZ (partnerský ústav), nebo
    vlastní praktický lékař zaměstnance. U ÚLZ appka navíc nabídne na
    výběr: zadat konkrétní termín a hodinu, nebo zvolit „Domluví se
    zaměstnanec sám" – v tom případě appka datum/hodinu nevyžaduje
    a v e-mailu zaměstnanci napíše, ať si termín domluví sám přímo
    s ústavem (místo konkrétního času nebo obecného „termín vám sdělí
    personální oddělení").

  Appka vždy zobrazuje i pole **datum narození** a **adresa trvalého
  pobytu** – jakmile zaměstnanec vyplní osobní dotazník, doplní se
  automaticky jeho údaji a pole se needitovatelně zamknou (dotazník
  má vždy přednost). Dokud dotazník vyplněný není, HR je může vyplnit
  ručně přímo tady – díky tomu lze žádost připravit a odeslat hned na
  začátku, společně s odkazy na nástupní dokumenty, ne až po vyplnění
  dotazníku. Tlačítkem **„Vygenerovat žádost"** HR dostane PDF
  k vytištění; po podpisu a orazítkování ho naskenuje a tlačítkem
  **„Nahrát podepsanou žádost"** nahraje zpět – appka žádnou část
  podpisu/razítka sama nedokresluje.

  Odeslání zaměstnanci jde udělat na dvou místech, podle toho, co je
  zrovna hlavní cíl:
  - v záložce **„Nástupní dokumenty"** je primární odeslání odkazů na
    nástupní dokumenty, žádost o prohlídku je tam jen volitelná
    příloha (zaškrtnutím **„Přiložit i žádost o pracovnělékařskou
    prohlídku"**),
  - v záložce **„Lékařská prohlídka"** je to naopak – primární je
    samostatné tlačítko **„Odeslat žádost"**, a pokud ještě existují
    nástupní dokumenty, které zaměstnanec nevyplnil, nabídne se
    volitelné přiložení jejich odkazů k témuž e-mailu (u dokumentů,
    které už zaměstnanec vyplnil, se znovuodeslání odkazu nenabízí –
    nemělo by smysl).

  Obě možnosti vyžadují vyplněné povinné údaje a nahranou podepsanou
  žádost. Jakmile je žádost jednou odeslaná, appka to na obou místech
  zobrazí a nenabízí odeslání znovu, aby nešlo omylem poslat podruhé.

  Nahoře v okně Dokumenty, nad oběma záložkami, appka navíc zobrazuje
  malou informační hlavičku s pozicí, odborem a oddělením zaměstnance
  – stejně viditelnou bez ohledu na to, která záložka je otevřená.

  Appka navíc 7 dní po založení záznamu nástupu (a dál opakovaně
  každé 3 dny, dokud se nevyřeší) připomene Personálnímu oddělení,
  pokud u nástupu s vyplněným osobním dotazníkem ještě nebyla žádost
  o prohlídku odeslána – společně s případnou stejnou připomínkou na
  nezaslané nástupní dokumenty v jednom e-mailu.

  **Stav připravenosti a uzamčení nástupních dokumentů** – jakmile
  jsou u nástupu kompletně hotové (vyplněné/podepsané) všechny tři
  nástupní dokumenty a zároveň odeslaná žádost o lékařskou prohlídku,
  appka to sama pozná a v okně Dokumenty nahoře nabídne tlačítko
  **„Označit jako hotové a zamknout"** – zároveň o tom opakovaně (každé
  3 dny, i po přechodu nástupu na skutečný) připomíná Personálnímu
  oddělení e-mailem, dokud to někdo neoznačí. Toto jednoznačné pole
  (appka ho uvnitř eviduje jako „rozpracováno / připraveno /
  uzamčeno") slouží jako budoucí podklad pro Systemizaci nebo jiné
  napojené systémy, aby poznaly, že data k nástupu jsou kompletní
  a připravená k přečtení. Jakmile je záznam takto uzamčený, nejde
  dál upravovat ani nástupní dokumenty, ani žádost o lékařskou
  prohlídku – odemknout ho zpátky k úpravám může jen HR nebo
  administrátor appky tlačítkem „Odemknout" na stejném místě.

Pokud se k danému osobnímu číslu později objeví i odpovídající
odchod, aplikace záznamy **automaticky propojí** – u nástupu se pak
zobrazí informace o odchodu a případně se zastaví sledování zkušební
doby. Jde výhradně o informační propojení; žádná data se mezi
nástupem a odchodem nepřepisují.

### 5.3 Odchody

**Jak založit odchod:** stejný postup jako u nástupu (kapitola 5.2) –
založit záznam s plánovaným datem konce, později potvrdit **skutečný**
konec pracovního poměru. Vedoucí odboru se dohledává automaticky podle
čísla funkce a lze ho ručně přepsat nebo znovu dohledat tlačítkem
„Obnovit dle pozice" – poslední zadaná hodnota se vždy uloží a použije
i ve výstupním listu. Dohledaný vedoucí je vidět přímo v detailu
odchodu, ne jen po otevření výstupního listu. Automatické dohledání se
ale nemusí vždy podařit (např. neobsazená pozice nebo chybějící údaj
v systemizaci) – v takovém případě je potřeba vedoucího doplnit ručně.

Při zakládání odchodu jde zaškrtnout **„Vyplnit vlastní data"**, pokud
zaměstnanec zatím není v EOS nebo se má zadat ručně. I v tomto režimu
je ale nově k dispozici **samostatné vyhledávání osoby a pozice v
EOS/systemizaci** – po vyhledání se jméno/kontakt, případně pozice a
zařazení, jen předvyplní do polí níže a dál je jde libovolně upravit.

Z detailu odchodu se dále řídí:

- **Výstupní list** – vlastní stránka (`/odchody/[id]/vystupni-list`,
  dřív modální okno) se všemi akcemi a informacemi k výstupnímu
  procesu zaměstnance: odeslání k podpisu (Odeslat všem k podpisu,
  Odeslat k podpisu, Odeslat k podpisu v zastoupení), přehled a správa
  osob k podpisu, generování a odesílání PDF, uzamčení/odemčení
  a historie. Tlačítko zpět vede vždy na přehled Odchodů.

  Stránka je rozdělená na dvě jasně oddělené části: nahoře karta
  „Nastavení a odeslání k podpisu" (výpis majetku, předávaná agenda,
  odeslání k podpisu – tedy vše, co je potřeba vyřešit dřív, než se
  list pošle k podpisu), pod tím samotný **dokument výstupní list**
  (v kódu appky označovaný jako „exit-checklist") se strukturovanými
  sekcemi:
  - vrácení majetku a vybavení,
  - předání agendy (komu a co),
  - střet zájmů,
  - podpis zaměstnance, vedoucího a vydávajícího.

  Rozhodnutí o střetu zájmů („Ano"/„Ne") se dělá výhradně v okně
  **„Osoby k podpisu"** (viz níže) – v hlavním formuláři je jen
  needitovatelný informační štítek s aktuálním stavem. Dokud není
  rozhodnuto, cron před prvním odesláním pozvánek na to HR upozorní
  (viz „Automatické upomínky" níže); samotné odeslání pozvánek tím
  není blokované.

  Dokument se částečně vyplňuje interně (HR/IT), částečně jej vyplňuje
  a podepisuje sám odcházející zaměstnanec nebo jeho vedoucí
  prostřednictvím veřejného odkazu (kapitola 6). Jméno a e-mail
  vedoucího se do dokumentu při jeho založení automaticky přebírá
  z odchodu.

  Dokument výstupní list je hotový, až jsou podepsané úplně **všechny
  vyžadované položky** – nejen zaměstnanec, vedoucí a vydávající, ale i
  každý další řádek, který se k danému odchodu váže (vrácení
  konkrétního vybavení, předání agendy, případně střet zájmů), tedy
  reálně všichni, kdo mají v „Odeslat všem k podpisu" u daného řádku
  co podepsat. Teprve jakmile jsou podepsaná úplně všechna políčka,
  aplikace automaticky pošle HR e-mail s PDF podepsaného dokumentu
  v příloze a samostatný informační e-mail odcházejícímu zaměstnanci,
  že má výstupní list podepsaný a má se dostavit na Personální oddělení
  pro zápočtový list.

  Pozor: pokud HR do „Odeslat všem k podpisu" ručně přidá zcela nového
  člověka, který v dokumentu nemá žádný svůj konkrétní řádek k podpisu
  (není mezi předdefinovanými signatáři ani není zaměstnanec či
  vedoucí), jeho podpis se do vyhodnocení „je vše podepsáno" nijak
  nepočítá – takový člověk dostane e-mail a připomínky, ale dokument se
  může uzavřít, i kdyby on sám nic nepodepsal.

**Kdo smí výstupní list podepsat:** ve veřejné verzi (přes odkaz,
mimo appku) je to přesně skupina lidí uložená v seznamu osob k podpisu
(viz níže), a to bez ohledu na to, jakou roli má daný e-mail nastavenou
v administraci appky – rozhoduje výhradně příslušnost k tomuto seznamu.
Kdo z něj byl odebraný, už si výstupní list přes svůj odkaz vůbec
nezobrazí, jen hlášku „Nemáte přístup k podpisu tohoto výstupního
listu. Pokud je něco v nepořádku, kontaktujte Personální oddělení.",
a to dokud ho HR nevrátí zpět tlačítkem „Vrátit". V interní appce
naproti tomu vidí a mohou podepisovat vždy uživatelé s rolí HR, IT,
READONLY nebo admin, bez ohledu na to, jestli jsou v seznamu.

**Jak odeslat výstupní list k podpisu – „Odeslat všem k podpisu":**

1. Na stránce výstupního listu otevřít tlačítko **„Odeslat všem
   k podpisu"**. Okno při otevření vždy načte **aktuální naposledy
   uložený seznam** příjemců (je vidět, kdy a kým byl potvrzen); teprve
   pokud pro daný odchod ještě žádný seznam neexistuje, nabídne k úpravě
   výchozí návrh – standardně zaměstnanec a vedoucí. Tenhle výchozí
   návrh je ale jen pomůcka – dokud se z něj opravdu někomu neodešle
   pozvánka, nikam se neukládá.
2. HR může seznam upravit: **přidat dalšího příjemce** – buď tlačítkem
   **„Vybrat ze zaměstnanců"** (vybraný člověk se jen předvyplní do
   políček jméno/e-mail, dá se ještě upravit a teprve tlačítkem
   „Přidat" se skutečně přidá), nebo ručním vypsáním jména a e-mailu
   (typicky vydávající majetek, spisovou službu, mzdovou účtárnu,
   právní odbor apod., podle toho, kdo má u daného odchodu skutečně co
   podepsat). Zaškrtávátkem **„Přidat jako zastupujícího za"** jde
   rovnou vybrat zodpovědnou osobu/odbor, za kterou bude přidaný
   člověk podepisovat –
   dostane pak ten odlišný e-mail pro zastoupení, i když se odesílá
   hromadně spolu s ostatními. Nově přidaný člověk se rovnou zaškrtne
   k odeslání.
3. Zaškrtnout, komu se má (znovu) odeslat – u každého, komu už dřív
   bylo odesláno, je vidět poznámka „Odesláno [datum a čas]". Teprve
   tlačítkem **„Odeslat vybraným"** dostane zaškrtnutá skupina e-mail
   s odkazem k podpisu a **tento seznam se pro daný odchod uloží** (jen
   ti, komu už bylo skutečně odesláno – nikdy neodeslaní kandidáti
   z výchozího návrhu se neukládají) – všechny další automatické
   připomínky (viz níže) se od té chvíle řídí jen jím.
4. Kdokoli, komu se pošle samostatná pozvánka tlačítkem **„Odeslat
   k podpisu"** nebo **„Odeslat k podpisu v zastoupení"** (mimo hlavní
   okno „Odeslat všem"), se do uloženého seznamu **automaticky přidá** –
   tyto jednotlivé pozvánky zbytek seznamu nemažou, jen do něj doplňují
   další lidi, takže automatizace i vyhodnocení „už podepsáno" počítají
   se všemi, komu bylo kdy odesláno, ať už kterýmkoli způsobem.

Jedna a tatáž osoba (stejný e-mail) může být v seznamu ve dvou různých
rolích zároveň – jednou přímo za sebe a případně ještě jednou (nebo
víckrát) v zastoupení za jinou odpovědnou osobu/odbor. Aplikace tyto
role eviduje a vyhodnocuje nezávisle na sobě – zrušení jedné role
neovlivní tu druhou a za každé jiné zastoupení chodí samostatný e-mail,
i když jde o stejnou osobu.

Odcházející zaměstnanec dostává na svůj podpis **jinou verzi e-mailu**
než ostatní signatáři – informuje ho, že jeho odchod byl zaevidován a má
si vyřídit předání agendy a vrácení majetku, než výstupní list podepíší
všechny strany. Vedoucí odboru a odpovědná osoba za sekci B dostávají
stejnou pozvánku jako kterýkoli jiný podepisující, jen navíc se
zvýrazněnou poznámkou, kterou konkrétní sekci mají vyplnit a podepsat –
stejná poznámka jde i tomu, kdo je přidán „v zastoupení" za ně.

**Kdo smí ve veřejné verzi co dělat** (podle role v tomto seznamu, ne
podle role v appce):

- **Odcházející zaměstnanec** – smí podepsat jen svůj vlastní řádek
  v hlavičce, nic jiného a ani za vedoucího. Řádek podpisu zaměstnance
  na veřejném odkaze navíc smí podepsat jen účet se stejným e-mailem,
  jaký má u odchodu uvedený odcházející zaměstnanec – ne kterýkoli
  přihlášený uživatel z povolené domény. Žádnou jinou sekci nesmí
  upravovat ani podepisovat, ale historii změn (tlačítko „Historie") a
  informaci, kdo co podepsal, vidí stejně jako interní uživatelé.
- **Vedoucí odboru** – smí podepsat svůj podpis v hlavičce, řádek
  „předávací protokol" v sekci A a vyplnit/podepsat sekci C (jsou to tři
  samostatné podpisy, viz níže) a má přístup do sekce A i B jako kterýkoli
  jiný podepisující, ale nesmí podepsat ani upravit řádek zaměstnance
  v hlavičce.
- **Ostatní podepisující** (bez role vedoucí/zaměstnanec) – nesmí na
  hlavičkové podpisy zaměstnance ani vedoucího, ani na sekci C (tu smí
  vyplnit a podepsat jen vedoucí); mají přístup jen do sekce A, případně
  B (tu obvykle vyplňuje konfigurovaná odpovědná osoba za sekci B, ale
  přístup mají všichni podepisující).
- **Konkrétní funkční signatáři** (SNEO, spisová služba, mzdová
  účtárna, Personální oddělení, KITT6, Právní odbor...) i lidé přidaní
  „v zastoupení" za takovou osobu mají v sekci A přiřazený svůj
  řádek/řádky – podpis cizího řádku jim appka nezakáže, jen na to
  upozorní („Toto není vaše agenda – opravdu ho chcete podepsat i
  přesto?"). Důležité je, že se na ně dál spoléhají automatické
  připomínky: dokud nemají podepsané úplně všechny své přiřazené
  řádky, počítají se jako nepodepsaní a připomínka jim chodí dál, i
  kdyby jeden z více řádků už podepsali.
- **Jednou podepsaný řádek** (kdekoliv v listu) nejde dál upravovat ani
  zrušit – ani hodnotu Ano/Ne, ani poznámku – nikým jiným než tím, kdo
  ho podepsal; ten musí nejdřív zrušit svůj podpis, než se dá cokoliv
  změnit. V interní appce to navíc smí ADMIN/HR/IT (přepsat/zrušit cizí
  podpis), ve veřejné verzi vždy jen ten, kdo podepsal.

Automatické připomínky k podpisu sledují u každého člověka všechny
řádky, které má na starosti – pokud má někdo na starosti víc řádků
(někteří funkční signatáři mají i 3), chodí mu připomínka, dokud nejsou
podepsané úplně všechny, ne jen jeden z nich; totéž platí pro
zastupujícího, pokud zastupuje za takovou osobu.

Vedoucí odboru podepisuje na **třech samostatných místech**: nahoře
v hlavičce („Podpis vedoucího odboru"), u řádku „předávací protokol"
v části A a v sekci C (způsob předání agendy) – každé se podepisuje
i zrušuje zvlášť, nic se mezi nimi automaticky nekopíruje. Appka ale
hlídá, že osoba nastavená jako vedoucí odboru daného odchodu má hotové
všechny tři: při kliknutí na „Uložit" ve veřejné verzi potvrzovací okno
(„Uložit výstupní list?") vypíše, co jí ještě chybí.

**Předání agendy (sekce C) – kdo a kdy dostane e-mail:** vedoucí odboru
v sekci C vybere jeden ze tří způsobů předání agendy a svůj výběr
podepíše (propojeno s podpisem v hlavičce výše). Teprve po podpisu a
**uložení** appka automaticky odešle informační e-mail (s tabulkou
zaměstnance/odchodu a jménem a pozicí vedoucího, který volbu zvolil):
na kontakt KITT6 (volba „OI-KITT6 předá na jiné funkční místo") nebo
každé vybrané odpovědné osobě samostatně (volba „zůstává na
neobsazeném funkčním místě", odpovědná osoba(y) za dokumenty). Pokud
se vedoucí později vrátí, volbu změní (jiný způsob, jiné cílové místo
u KITT6, jiný seznam odpovědných osob) a znovu podepíše a uloží,
appka automaticky pošle e-mail i těm, komu už dřív info odešla, že
jejich dřívější role v předání agendy byla zrušena a byl potvrzen
jiný způsob – žádné další kroky z jejich strany už nejsou potřeba.
Podpis sekce C je nezávislý na sekci B (majetek) – jde o různé osoby
a různé věci, takže vyplnění/podpis jedné sekce neblokuje druhou.

Podpis **„Za Odbor služeb potvrzuje správnost Výpisu"** v sekci B je
needitovatelné (disabled) tlačítko, dokud není vyplněn alespoň jeden
řádek majetku nebo zaškrtnuto „žádný majetek" – tooltip na tlačítku
vysvětlí, co ještě chybí.

**Potvrzovací okno při ukládání.** Kliknutí na „Uložit" (odkudkoli –
v samotném výstupním listu, na stránce okolo něj, nebo „Uložit
a odejít" v okně o neuložených změnách) nejdřív otevře okno „Uložit
výstupní list?", které shrne, co se po uložení skutečně stane: jaké
e-maily se odešlou (nové pozvánky k sekci C, oznámení o zrušení
dřívější volby), a pokud přihlášený ve veřejné verzi ještě nemá
podepsané všechny své řádky, upozorní, že mu budou dál chodit
připomínky. Tlačítko „Zpět k úpravě" okno jen zavře beze změny,
„Uložit a odeslat" uloží a případné e-maily odešle.

**Jak spravovat seznam osob k podpisu – „Osoby k podpisu":**

Vedle „Odeslat všem k podpisu" je samostatné tlačítko **„Osoby
k podpisu"**, které zobrazí aktuální uložený seznam bez nutnosti nic
znovu odesílat – u každého je vidět, kdy dostal pozvánku, a pokud
podepisuje v zastoupení, tak i za koho. Odsud jde:

- kohokoli **odebrat** (zrušit) – po potvrzení mu přestanou chodit
  automatické připomínky k podpisu tohoto výstupního listu a ve veřejné
  verzi už si výstupní list přes svůj odkaz vůbec nezobrazí, jen hlášku
  „Nemáte přístup k podpisu tohoto výstupního listu. Pokud je něco
  v nepořádku, kontaktujte Personální oddělení." Odebraný člověk se
  nemaže, jen se přesune do části **„Zrušení příjemci"** níže,
  s poznámkou, kdy byl zrušen.
- **kdykoli vrátit** zrušeného člověka zpět tlačítkem **„Vrátit"** –
  obnoví se mu právo podepisovat a znovu mu budou chodit připomínky,
  ale **nová pozvánka se mu neposílá**.
- **přidat nového příjemce** (ručně, nebo tlačítkem „Vybrat ze
  zaměstnanců") – tomu se rovnou odešle nová pozvánka k podpisu a
  přidá se do seznamu. Zaškrtávátkem **„Přidat jako zastupujícího za"**
  jde rovnou vybrat, za kterou zodpovědnou osobu/odbor bude
  podepisovat – dostane pak ten odlišný e-mail s pozvánkou pro
  zastoupení. Pokud zastupovaná osoba ještě v seznamu není, přidá se
  automaticky i ona (jako běžný přímý příjemce) – dostane tak dvojí
  info: vlastní pozvánku i informaci, že ji/ho nyní někdo zastupuje
  (jméno, pozice a odbor zástupce, a že zastupovaná osoba může i tak
  dál podepsat sama).
- **zrušit zastoupení** u konkrétního zástupce – ten ztratí právo
  podepisovat v zastoupení (zbytek jeho případných rolí se nemění) a
  zastupovaná osoba dostane e-mail se stejnou tabulkou, že její
  zastoupení bylo zrušeno a může si vybavit podpis sama.

Rozhodnutí o střetu zájmů („Ano"/„Ne") je úplně nahoře v tomto okně.
Nijak se neodesílá hned při kliknutí – teprve hlavní tlačítko
**„Uložit"** dole v okně uloží a případně i odešle/zruší pozvánku
Právnímu odboru (podle volby) společně s ostatními změnami v okně
(přidání/odebrání příjemců, úprava odpovědných osob za sekci B, C a
kontaktu KITT6). Uložení v tomto okně je **samostatné** – není potřeba
nic znovu ukládat v hlavním formuláři výstupního listu, aby se změny
propsaly a e-maily odeslaly.

**Automatické upomínky na blížící se konec pracovního poměru** – dokud
je odchod jen **plánovaný** (skutečný konec ještě není potvrzený):

- Dřív než HR pro daný odchod poprvé odešle jakoukoli pozvánku
  k podpisu, aplikace (od 1 měsíce před plánovaným koncem, u krátké
  výpovědní doby do 2 měsíců nebo s vlastními daty hned) kontroluje,
  že je vyplněný vedoucí odboru a rozhodnutý střet zájmů – pokud něco
  chybí, pošle o tom HR jeden e-mail s výčtem, co doplnit.
- Po odeslání pozvánek, dokud výstupní list není kompletně podepsaný,
  aplikace automaticky **14, 7, 5, 3, 2, 1 a 0 dní** před plánovaným
  koncem:
  - pošle **cílenou připomínku každému, kdo je v naposledy uloženém
    seznamu příjemců a ještě nepodepsal** – ne jen zaměstnanci a
    vedoucímu, ale komukoli, kdo v seznamu skutečně je, s poznámkou
    podle jeho role (zaměstnanec / vedoucí / odpovědná osoba za sekci
    B), co konkrétně ještě má vyřídit,
  - pokud na daný den zbyl alespoň jeden nepodepsaný, pošle na stejný
    den i **jeden souhrnný report pro HR** se jmény a e-maily těch,
    co ještě nepodepsali,
- na stránce výstupního listu zobrazí barevný banner (žlutý do 7 dnů,
  červený v posledním týdnu nebo po termínu),
- každou odeslanou upomínku i uložení/úpravu seznamu příjemců zapíše
  do historie výstupního listu.

Pozvánky i tyto připomínky obsahují u data konce pracovního poměru i
odkaz/tlačítko **„Přidat do kalendáře"** (Google kalendář).

Jakmile se odchod potvrdí jako **skutečný**, tahle automatizace se pro
daný záznam úplně zastaví – smysl má jen dokud je odchod ještě
plánovaný a je čas věci stihnout podepsat.

Stejně jako u nástupů platí automatické informační propojení podle
osobního čísla s odpovídajícím nástupem.

**Hlídání prošlých plánovaných odchodů bez potvrzení** – pokud uplyne
plánované datum odchodu a nikdo v appce nepotvrdil, jestli k odchodu
skutečně došlo (ani skutečný odchod, ani neuskutečněný), objeví se
nahoře v přehledu Odchodů červený banner se jmény a tlačítky „Odešel"
a „Neuskutečnil se" u každého z nich; při více takových záznamech jde
otevřít hromadné okno, zaškrtnout vybrané a vyřídit je najednou.
Personální oddělení navíc od plánovaného konce dostane e-mail
s připomínkou a odkazem do přehledu – a dokud skutečný konec nikdo
nepotvrdí (nebo odchod nezruší), e-mail se opakuje každé 3 dny.

**Neuskutečněný odchod** – pokud se plánovaný nebo i skutečně potvrzený
odchod nakonec nestane (zaměstnanec zůstal, přešel na jiné oddělení
apod.), tlačítkem **„Neuskutečnil se"** u daného záznamu se odchod
přesune do samostatné sekce/záložky **„Neuskutečněné"**. Důvod zrušení
je možné (ale není povinné) vyplnit. Zrušený záznam:

- zmizí z aktivních filtrů plánovaných i skutečných odchodů a ze
  statistik,
- zůstává evidovaný v záložce „Neuskutečněné" i s uvedeným důvodem,
  kým a kdy byl zrušen,
- jde kdykoliv tlačítkem **„Vrátit"** obnovit zpět tam, kde byl (do
  plánovaných, nebo do skutečných, pokud už měl vyplněné skutečné
  datum odchodu) – i opakovaně tam a zpět, každá změna se zapisuje
  do historie záznamu.

Filtr „Stav" u Odchodů nabízí stejné možnosti jako u Nástupů:
Plánované, Skutečné, Neuskutečněné a Vše.

Neuskutečněné odchody jde stejně jako u nástupů nově zahrnout i do
okna "Generovat PDF report" a mají v sekci Statistiky (kapitola 5.5)
vlastní KPI kartu.

**Hromadné akce** – nad seznamem každé ze tří sekcí (Plánované,
Skutečné, Neuskutečněné), u Nástupů i Odchodů, je vedle tlačítka
„Smazané záznamy" tlačítko **„Hromadné akce"** (barevně odlišené
stejně jako tlačítko „Zaslat měsíční report" dané sekce; zobrazí se,
jen když sekce obsahuje víc než jeden záznam). Otevře okno se
zaškrtávacím seznamem všech záznamů dané sekce podle právě
nastaveného filtru, seskupených po měsících – zaškrtnutím měsíce se
vyberou najednou všechny záznamy v něm, tlačítkem „Vybrat vše" úplně
všechny. Nabízené akce v okně se liší podle sekce, ve které jste
tlačítko otevřeli, a dělají přesně totéž, co odpovídající tlačítko
u jednotlivého záznamu, jen najednou pro všechny vybrané; popisek
tlačítka se podle počtu vybraných záznamů přepíná mezi jednotným
a množným číslem (např. „Nastoupil" u jednoho záznamu, „Nastoupili"
u víc):

- **Plánované** → „Odešel(i)"/„Nastoupil(i)" (ke dni plánovaného
  nástupu/konce u každého záznamu zvlášť, výpovědní lhůta nebo
  zkušební doba se dopočítá automaticky stejně jako u jednotlivého
  potvrzení) nebo „Neuskutečnil(i) se"/„Nenastoupil(i)" (u nástupů je
  potřeba vyplnit společný důvod zrušení, u odchodů je nepovinný),
- **Skutečné** → „Vrátit do plánovaných" (zruší se u vybraných
  zaznamenané skutečné datum) nebo stejně jako u Plánovaných
  „Neuskutečnil(i) se"/„Nenastoupil(i)" (přímé zrušení i ze stavu
  „skutečné"),
- **Neuskutečněné** → „Obnovit" (každý vybraný záznam se vrátí tam,
  kde byl před zrušením – do plánovaných, nebo do skutečných, pokud
  už měl vyplněné skutečné datum).

Jde o doplňkovou možnost vedle už existujících tlačítek u
jednotlivého záznamu – nic se tím neruší ani nemění, jen to jde dělat
pro víc záznamů najednou. U Odchodů tím není dotčený ani nijak
nahrazený červený banner pro prošlé plánované termíny bez potvrzení
(ten řeší jen tuto jednu konkrétní situaci a zůstává beze změny).

### 5.4 Zaměstnanecké změny

**Jak založit změnu:** v menu **Změny** → nový záznam → zvolit typ
(změna jména, změna pozice, obojí, nebo odchod na mateřskou dovolenou)
→ vyplnit osobní číslo a nové údaje → uložit. Zaměstnance lze vybrat
z EOS (údaje se jen předvyplní pro potřeby appky), nebo zadat ručně.

Změny jsou čistě **informační**: nikdy se nepropisují do nástupů ani
odchodů. Propojení podle osobního čísla slouží pouze k zobrazení, že u
dané osoby v minulosti proběhla i jiná změna.

**Kontaktní údaje** – u každé změny jde volitelně vyplnit i **e-mail
zaměstnance** a **vedoucího odboru** (jméno a e-mail). Vedoucí se
dohledává automaticky podle pozice zaměstnance (tlačítkem „Obnovit dle
pozice" i znovu), lze ho ale kdykoli přepsat ručně nebo vyhledat
v EOS. Tyto údaje se zobrazují jako samostatné sloupce **„Kontakt"** a
**„Vedoucí"** v přehledu Změn a jako karta na detailu záznamu – do
e-mailových reportů (kapitola 5.6) se nepropisují.

**Popisek typu změny** ve sloupci „Typ změny", ve filtru, na detailu
i v PDF/e-mailových reportech vždy odpovídá tomu, co se u dané změny
skutečně změnilo, ne jen obecné kategorii – např. „Změna příjmení a
titulu" místo obecného „Změna jména", nebo „Změna pozice/oddělení/
odboru", případně kombinace obojího. Popisek je napříč celou appkou
(přehled, filtr, detail, historie, statistiky, PDF i e-mailové
reporty) vždy sestavený stejným způsobem, takže se stejná změna
všude popisuje stejnými slovy.

**Odchod na mateřskou dovolenou** je samostatný typ změny – nemá
starou/novou hodnotu, jen datum účinnosti (den odchodu). V přehledu,
detailu i propojených záznamech se zobrazuje jako zvýrazněný, ale
nekřiklavý štítek. V e-mailu s reportem má tento řádek navíc odkaz
**„Přidat do kalendáře"** (viz kapitola 5.6).

### 5.5 Statistiky

Agregovaný pohled nad nástupy, odchody a změnami:

- **KPI karty** – např. počty nástupů/odchodů, čistý přírůstek, podíl
  odchodů ve zkušební době.
- **Hlavní grafy** – vývoj nástupů/odchodů v čase, fluktuace podle
  odboru, změny podle typu v čase (změna jména, pozice, obojí i odchod
  na mateřskou dovolenou zvlášť).
- **Zdraví procesu** – karty sledující stav dokumentů, hodnocení,
  výstupních listů a dodržování termínů.
- **Vlastní pohledy** – uživatel si sestaví vlastní kombinaci metriky,
  rozpadu a typu grafu, může si ji uložit jako oblíbenou a kdykoli
  znovu načíst (uložení/smazání vlastního pohledu ale READONLY nemá).
- **Export a odeslání** – vybraný obsah lze stáhnout nebo odeslat
  e-mailem jako PDF; to smí i role READONLY.

### 5.6 Měsíční e-mailové reporty

Z Nástupů, Odchodů i Změn lze otevřít společné okno pro odeslání
souhrnného e-mailu. V něm se volí:

- jeden nebo více měsíců současně,
- příjemce – „vybraná skupina" (typicky plánované údaje), „všichni
  zaměstnanci" (typicky skutečné údaje), nebo „vlastní e-mail". U
  vlastního e-mailu lze tlačítkem „Přidat e-maily" přidat najednou
  víc adres (otevře se okno pro přidávání, přidané adresy jdou
  jednotlivě i odebrat). U „vybrané skupiny" a „všech zaměstnanců" jde
  ikonkou oka vedle popisku zobrazit v okně skutečný seznam adres, na
  které se pošle (podle nastavení v appce),
- u změn navíc typ změny, který má být do reportu zahrnut,
- forma odeslání – jeden souhrnný e-mail se všemi tabulkami pod
  sebou, nebo samostatné e-maily po jednotlivých typech.

Tlačítko **„Stáhnout PDF"** v okně vygeneruje PDF se stejným obsahem a
vzhledem, jaký by měl odeslaný e-mail podle aktuálního výběru – vhodné
pro archivaci nebo přeposlání mimo appku.

Aplikace eviduje, které záznamy již byly v daném měsíci odeslány, a
před opětovným odesláním na to upozorní. Tento report smí **odeslat**
jen ADMIN, HR a IT – READONLY jej může prohlížet, ale ne odesílat
(narozdíl od exportu PDF u Statistik, který READONLY odeslat smí – viz
kapitola 3).

Každý řádek v reportu (nástup, odchod i odchod na mateřskou dovolenou)
má vlastní odkaz **„Přidat do kalendáře"** (Google kalendář).
Celý e-mail navíc obsahuje jednu společnou přílohu .ics se všemi
událostmi z reportu najednou, kterou jde v Outlooku nebo Apple
Kalendáři otevřít a naimportovat vše hromadně jedním krokem (u Google
kalendáře stejná příloha jde naimportovat přes jeho vlastní funkci
Import v nastavení).

### 5.7 Přehled dokumentů

Stránka **Dokumenty** (`/dokumenty`) ukazuje jedním pohledem, jak na
tom je s dokumenty každý člověk v aplikaci – nástupní dokumenty,
vyhodnocení zkušební doby i výstupní list, seřazené podle roku, měsíce
a osoby. Nástupy a Odchody jsou přepínatelné jako dvě záložky vedle
sebe (ne pod sebou), aby se v dlouhém seznamu dalo rychleji
orientovat.

- **Hledání a filtry** – vyhledávací pole hledá podle jména, osobního
  čísla, odboru i oddělení; k dispozici jsou i filtry na typ
  (nástup/odchod), odbor, stav záznamu (plánovaný/skutečný/zrušený),
  stav dokumentů (vyplněno vše/rozpracováno/nevyplněno) a **stav
  odeslání** (nevytvořeno/neodesláno/odesláno-nevyplněno/vyplněno) –
  ten poslední se hodí hlavně na rychlé dohledání, komu se ještě
  nějaký formulář nebo dokument vůbec neposlal. Jakmile něco
  vyhledáte nebo zafiltrujete, appka automaticky rozbalí přesně ty
  roky, měsíce i konkrétní lidi, kterých se výsledek týká – není
  potřeba se k nim ručně proklikávat.
- **Barevné rozlišení podle stavu** – karta každého člověka je jemně
  podbarvená podle toho, jestli jde o plánovaný nebo skutečný
  nástup/odchod (nástupy modře/zeleně, odchody oranžově/červeně,
  zrušené záznamy šedě), takže je na první pohled vidět, o co jde.
- **„Rozbalit vše" / „Sbalit vše"** – u Nástupů i Odchodů je jedno
  tlačítko, které rozbalí, nebo když je vše rozbalené, zase sbalí
  všechny roky a měsíce v dané sekci najednou. Stejné tlačítko
  („Rozbalit měsíce" / „Sbalit měsíce") je i u každého jednotlivého
  roku, když chcete projet jen jeden rok.
- **Detail osoby** – kliknutím na jméno se rozbalí přehled všech jejích
  dokumentů se stavem, možností dokument rovnou **zobrazit v náhledu**
  na stránce (bez stahování, s indikátorem načítání, dokud se náhled
  nenačte), stáhnout, poslat e-mailem nebo zobrazit historii.
- **Hromadné akce u jedné osoby** – po rozbalení detailu lze tlačítkem
  **„Stáhnout vše"** stáhnout najednou všechny dostupné dokumenty dané
  osoby, nebo tlačítkem **„Poslat vše"** odeslat na jeden zadaný e-mail
  jedním e-mailem s PDF v příloze všechny **vyplněné** dokumenty
  najednou. Dokumenty, které zaměstnanec ještě nevyplnil (jen rozpracované
  nebo zatím prázdné), se do „Poslat vše" nepočítají – ty jde poslat
  jen jednotlivě tlačítkem „Poslat odkaz" u konkrétního dokumentu.
- **Krátká poznámka u každého dokumentu** – pod stavem dokumentu je
  drobný text s tím, na čem dokument je: „Zatím neodesláno", „Odesláno 12. 8. 2026 (Jan Novák)", případně i s poslední automatickou
  připomínkou, nebo „Vyplněno 10. 8. 2026". U automaticky odeslaných
  věcí (cron) je to vidět místo jména konkrétního člověka.

Přístup má ADMIN, HR a IT (viz kapitola 3).

## 6. Veřejné odkazy pro zaměstnance a nadřízené

Část procesu probíhá mimo vnitřní aplikaci – zaměstnanec nebo
nadřízený obdrží e-mailem jednorázový odkaz vázaný na konkrétní
záznam, na kterém nepotřebuje mít v aplikaci účet ani roli:

- **Vyplnění osobních dokumentů** (`/dokumenty/[hash]`) – nový
  zaměstnanec zde vyplní osobní dotazník, čestné prohlášení a další
  podklady k nástupu.
- **Výstupní list** (`/odchody-public/[token]`) – odcházející
  zaměstnanec nebo jeho nadřízený zde potvrdí vrácení majetku,
  předání agendy a podepíše výstup.
- **Vyhodnocení zkušební doby** (`/vyhodnoceni-zkusebni-doby/[token]`)
  – od verze 0.15.0 vypnuto, odkaz zobrazí jen informaci, že se
  formulář přesunul do Systemizace (agendu od 30. 10. 2026 přebírá).

Podpis se v aplikaci vždy zapisuje s **celým jménem včetně titulů**
(pokud je má přihlášený uživatel v aplikaci vyplněné) – u jména za
titulem se správně píše čárka (např. „Jan Novák, MBA").

Tyto odkazy platí vždy jen pro daný záznam. Po vyplnění nebo podpisu
je možné formulář v aplikaci znovu uzamknout, případně odemknout
k opravě.

## 7. Historie, auditní stopa a smazané záznamy

Ke každému nástupu, odchodu, změně, dokumentu i výstupnímu listu
aplikace vede historii – kdo, kdy a jakou akci provedl (vytvoření,
úprava, smazání, obnovení, odeslání e-mailu, upomínka, uložení
seznamu příjemců k podpisu, propojení se záznamem apod.). Historii lze
zobrazit přímo u konkrétního záznamu i souhrnně u reportů, tlačítkem
„Historie".

U seznamu nástupů, odchodů i změn je navíc samostatné tlačítko
**„Smazané záznamy"**, které zobrazí jen smazané položky daného typu a
umožní jejich obnovení – smazání tedy není nevratné, dokud záznam
někdo trvale neodstraní přímo v databázi.

## 8. Časté otázky (FAQ) pro školení

**Proč u odchodu nevidím upomínku, i když se blíží konec pracovního
poměru?**
Automatické upomínky běží jen pro **plánované** odchody. Jakmile se
konec potvrdí jako skutečný, aplikace bere danou osobu za skutečně
odešlou a upomínky na dopodepsání výstupního listu končí.

**Proč cílená připomínka k podpisu nechodí konkrétnímu člověku?**
Cílené připomínky chodí jen lidem, kteří jsou v seznamu naposledy
uloženém přes „Odeslat všem k podpisu" u daného odchodu. Pokud tam
daný člověk není, je potřeba ho do seznamu přidat a znovu kliknout
„Odeslat všem".

**Proč se u vedoucího, který je zároveň tajemníkem, neposílá
vyhodnocení zkušební doby ještě jednou tajemníkovi zvlášť?**
Je to záměr – pokud je vedoucí odboru zároveň tajemníkem úřadu, jde o
jednu a tu samou osobu, takže se stanovisko nevyžaduje dvakrát ani se
neposílá zvláštní e-mail navíc.

**Proč IT nemůže u některého zaměstnance upravit interní dokument?**
Role IT smí interní dokumenty prohlížet a odeslat hotové PDF, ale
přiřazení, zámek a znovu-vygenerování dokumentu je vyhrazené HR a
ADMIN.

**Proč READONLY nemůže odeslat měsíční report, ale statistiky ano?**
Jsou to dvě různá oprávnění. READONLY smí generovat a e-mailem
odesílat PDF export ze Statistik, ale ne odesílat pravidelné měsíční
reporty z Nástupů/Odchodů/Změn – ty smí odeslat jen ADMIN, HR a IT.

**Co mám dělat, když jsem záznam smazala omylem?**
V seznamu Nástupů/Odchodů/Změn otevřít tlačítko „Smazané záznamy" a
záznam obnovit – smazání není nevratné.

**Proč se mi u nástupu automaticky objevil odkaz na odchod (nebo
naopak)?**
Aplikace propojuje nástupy a odchody podle **osobního čísla** – je to
jen informace, žádná data se mezi nimi nepřepisují.

**Kde zjistím, kdo a kdy nějakou změnu v aplikaci udělal?**
U konkrétního záznamu tlačítkem „Historie" – vidět je tam každá akce
včetně jména, e-mailu a času.

## 9. Slovníček pojmů

| Pojem                                    | Význam                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plánovaný** nástup/odchod              | Termín, který se má stát podle plánu, dosud nepotvrzen                                                                                                                                                                                                            |
| **Skutečný** nástup/odchod               | Termín potvrzený jako reálně proběhlý                                                                                                                                                                                                                             |
| **Výstupní list**                        | Modální okno u odchodu se všemi akcemi k výstupnímu procesu (odeslání k podpisu, osoby k podpisu, PDF, zámek, historie)                                                                                                                                           |
| **Dokument výstupní list**               | Hlavní součást okna Výstupní list – strukturovaný dokument se sekcemi majetek, agenda, střet zájmů, podpis (v kódu appky označovaný jako „exit-checklist")                                                                                                        |
| **Osoby k podpisu**                      | Skupina lidí (zaměstnanec, vedoucí, případně další signatáři, i v zastoupení), kterým HR naposledy poslala výstupní list k podpisu; podle ní se řídí cílené připomínky i to, kdo smí podepisovat – kdo z ní byl odebraný, nesmí podepsat, dokud není vrácen zpět  |
| **Vyhodnocení zkušební doby**            | Formulář hodnocení zaměstnance nadřízeným na konci zkušební doby. **Od verze 0.15.0 v appce vypnuté** – agendu přebírá Systemizace.                                                                                                                               |
| **Vyjádření tajemníka**                  | Druhá fáze vyhodnocení zkušební doby (viz výše) – tajemník úřadu se souhlasem/nesouhlasem, komentářem a podpisem vyjádří k doporučení nadřízeného, pokud jím není sám                                                                                             |
| **Žádost o pracovnělékařskou prohlídku** | Formulář pro vstupní lékařskou prohlídku nového zaměstnance, generovaný appkou ve vzhledu skutečného formuláře úřadu; HR ho vytiskne, nechá podepsat/orazítkovat a podepsanou naskenovanou verzi nahraje zpět k přiložení do e-mailu zaměstnanci.                 |
| **Zaměstnanecká změna**                  | Informační záznam o změně jména a/nebo pozice u stávajícího zaměstnance                                                                                                                                                                                           |
| **Osobní číslo**                         | Identifikátor zaměstnance, podle kterého se automaticky propojují nástup a odchod                                                                                                                                                                                 |
| **Upomínka na konec PP**                 | Automatická e-mailová upomínka pro osoby k podpisu a souhrnný report pro HR, 14/7/5/3/2/1/0 den před **plánovaným** koncem pracovního poměru, pokud výstupní list ještě není hotový (plus kontrola vedoucího a střetu zájmů ještě před prvním odesláním pozvánek) |
| **Smazané záznamy**                      | Přehled smazaných nástupů/odchodů/změn s možností obnovení                                                                                                                                                                                                        |
