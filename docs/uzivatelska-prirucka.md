# Uživatelská příručka – On/Off-boarding aplikace

Interní HR aplikace Úřadu městské části Praha 6 (a příspěvkové
organizace KITT6) pro evidenci nástupů, odchodů a zaměstnaneckých
změn, správu souvisejících dokumentů, vyhodnocení zkušební doby a
pravidelné reportování.

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
   HR otevře jeho nástup/odchod a odsud dál řídí dokumenty,
   vyhodnocení zkušební doby nebo výstupní list – nejde o samostatné,
   nesouvisející moduly, ale o „podstránky“ konkrétního nástupu/odchodu.
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

| Modul                                                    | ADMIN | HR    | IT    | READONLY | USER    |
| -------------------------------------------------------- | ----- | ----- | ----- | -------- | ------- |
| Přehled (kalendář)                                       | Č + Z | Č + Z | Č + Z | Č        | –       |
| Nástupy / Odchody                                        | Č + Z | Č + Z | Č + Z | Č        | –       |
| Zaměstnanecké změny                                      | Č + Z | Č + Z | Č + Z | Č        | –       |
| Interní dokumenty – prohlížení a odeslání PDF            | Č + Z | Č + Z | Č + Z | –        | –       |
| Interní dokumenty – přiřazení, zámek, znovu-vygenerování | Č + Z | Č + Z | –     | –        | –       |
| Vyhodnocení zkušební doby (interní správa)               | Č + Z | Č + Z | Č + Z | –        | –       |
| Výstupní list (interní správa a podpis)                  | Č + Z | Č + Z | Č + Z | Podpis¹  | Podpis¹ |
| Měsíční e-mailové reporty (Nástupy/Odchody/Změny)        | Č + Z | Č + Z | Č + Z | Č        | –       |
| Statistiky – prohlížení, export a odeslání PDF           | Č + Z | Č + Z | Č + Z | Č + Z    | –       |
| Statistiky – uložení/smazání vlastního pohledu           | Č + Z | Č + Z | Č + Z | –        | –       |
| Administrace (uživatelé a role)                          | Č + Z | –     | –     | –        | –       |
| Nastavení                                                | Č + Z | –     | –     | –        | –       |

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
  zámku a znovu-vygenerování), spravuje vyhodnocení zkušební doby a
  exit checklist, odesílá měsíční i statistické reporty.
- **IT** – má prakticky stejná práva jako HR u nástupů, odchodů, změn,
  vyhodnocení zkušební doby a exit checklistu. **Jeden rozdíl:** u
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

| Adresa                                    | Popis                                                               | Přístup                 |
| ----------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| `/prehled`                                | Kalendářní přehled nástupů a odchodů, výchozí stránka po přihlášení | ADMIN, HR, IT, READONLY |
| `/nastupy`                                | Seznam nástupů (plánované i skutečné)                               | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]`                           | Detail konkrétního nástupu                                          | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]/editovat`                  | Úprava nástupu                                                      | ADMIN, HR, IT           |
| `/nastupy/[id]/vyhodnoceni-zkusebni-doby` | Interní správa vyhodnocení zkušební doby k danému nástupu           | ADMIN, HR, IT           |
| `/odchody`                                | Seznam odchodů (plánované i skutečné)                               | ADMIN, HR, IT, READONLY |
| `/odchody/[id]`                           | Detail konkrétního odchodu, včetně exit checklistu                  | ADMIN, HR, IT, READONLY |
| `/odchody/[id]/editovat`                  | Úprava odchodu                                                      | ADMIN, HR, IT           |
| `/odchody/[id]/vystupni-list`             | Výstupní list k odchodu                                             | ADMIN, HR, IT, READONLY |
| `/zmeny`                                  | Seznam zaměstnaneckých změn                                         | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]`                             | Detail konkrétní změny                                              | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]/editovat`                    | Úprava změny                                                        | ADMIN, HR, IT           |
| `/dokumenty/internal/[id]`                | Interní správa dokumentu (generování, zámek, odeslání)              | ADMIN, HR, IT¹          |

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

| Adresa                               | Popis                                       | Přístup                             |
| ------------------------------------ | ------------------------------------------- | ----------------------------------- |
| `/dokumenty/[hash]`                  | Vyplnění osobních dokumentů zaměstnancem    | Odkaz z e-mailu                     |
| `/odchody-public/[token]`            | Vyplnění a podpis exit checklistu           | Odkaz z e-mailu                     |
| `/vyhodnoceni-zkusebni-doby/[token]` | Vyplnění hodnocení zkušební doby nadřízeným | Odkaz z e-mailu + Google přihlášení |

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
   funkce, nebo zadat ručně.
3. Uložit – záznam se objeví v seznamu jako **plánovaný**.
4. V den skutečného nástupu (nebo když je jistý) záznam otevřít a
   potvrdit **skutečný nástup** – tím se z plánovaného stane skutečný
   a začnou se počítat termíny odvozené od skutečného data (např.
   konec zkušební doby).

Z detailu nástupu se dále řídí:

- **Interní dokumenty** – osobní dotazník, čestné prohlášení, doklady
  o vzdělání a praxi, mzdové údaje. Dokumenty lze vyplnit přímo
  v aplikaci, nebo zaměstnanci zaslat odkaz či PDF e-mailem k
  samostatnému vyplnění (kapitola 6).
- **Vyhodnocení zkušební doby** – formulář vyplňovaný nadřízeným
  zaměstnance na konci zkušební doby, prostřednictvím veřejného
  odkazu (kapitola 6). HR/IT v aplikaci sledují stav, odesílají
  pozvánku i upomínky a po vyplnění mohou formulář znovu odemknout
  k opravě.

  **Kdo dostane e-mail a kdy** (přehled pro HR):
  1. HR odešle nadřízenému **pozvánku** k vyplnění (ručně, nebo ji
     automaticky připraví cron podle blížícího se konce zkušební
     doby). Dokud formulář není vyplněný, chodí nadřízenému
     automaticky i **připomínky** a HR informace, pokud nadřízený
     chybí nebo formulář stále není hotový.
  2. Jakmile nadřízený formulář **finálně odešle**, HR ihned dostane
     e-mail s vygenerovaným **PDF v příloze**.
     - Pokud nadřízený **není** zároveň tajemník úřadu, dostane ve
       stejnou chvíli e-mail i **tajemník** – PDF v příloze a odkaz
       „Otevřít k vyjádření“ (stejný odkaz, jaký měl nadřízený). HR
       e-mail v tomto případě navíc uvádí, že šlo i tajemníkovi.
     - Pokud je nadřízený sám tajemníkem (nebo jde o nástup přímo na
       pozici tajemníka), druhý krok odpadá – HR dostane jen tento
       jeden e-mail a je hotovo.
  3. Tajemník na svém odkaze vidí kompletní kontext (koho se
     vyhodnocení týká) i vyplněné hodnocení nadřízeného, a odděleně
     doplní souhlas nebo nesouhlas s doporučením, případný komentář a
     podpis. Po odeslání:
     - HR dostane **nový** e-mail s aktualizovaným PDF, ve kterém je
       vidět **obojí stanovisko najednou** – doporučení nadřízeného
       (ano/ne) i vyjádření tajemníka (souhlasí/nesouhlasí),
     - **nadřízený**, který formulář původně vyplnil, dostane
       samostatný e-mail s informací, že se tajemník vyjádřil a jak,
       včetně finálního PDF v příloze – aby věděl, že proces je
       u konce.
  4. Pokud HR formulář znovu odemkne k opravě a někdo uloží revizi,
     dostane HR znovu e-mail s aktuálním PDF; tajemníkovi ani
     nadřízenému se v tomto kroku nic automaticky neposílá.

  Tajemníka lze pro testovací nebo přechodné účely ručně přepsat
  (jméno a e-mail) přímo v detailu vyhodnocení zkušební doby, vedle
  údajů o nadřízeném – nastavení je globální a platí okamžitě pro
  všechny nástupy, dokud se nevrátí zpět na automatické dohledání. HR
  může po odemknutí vyplněného formuláře upravit i stanovisko
  tajemníka; podpis a čas podpisu přitom zůstávají zachované a změna
  se zapíše do historie.

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

Z detailu odchodu se dále řídí:

- **Výstupní list** – modální okno u odchodu se všemi akcemi
  a informacemi k výstupnímu procesu zaměstnance: odeslání k podpisu
  (Odeslat všem k podpisu, Odeslat k podpisu, Odeslat k podpisu
  v zastoupení), přehled a správa osob k podpisu, generování
  a odesílání PDF, uzamčení/odemčení a historie. Jeho hlavní součástí
  je samotný **dokument výstupní list** (v kódu appky označovaný jako
  „exit-checklist") se strukturovanými sekcemi:
  - vrácení majetku a vybavení,
  - předání agendy (komu a co),
  - střet zájmů,
  - podpis zaměstnance, vedoucího a vydávajícího.

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

**Kdo smí výstupní list podepsat:** je to přesně skupina lidí uložená
v seznamu osob k podpisu (viz níže) – kdo z ní byl odebraný, uvidí si
sice výstupní list přes svůj odkaz stále zobrazit, ale nesmí už nic
podepsat a místo toho se mu zobrazí informace, že byl odebrán a má
požádat o opětovné přidání. Uživatelé s vyšším oprávněním než běžný
zaměstnanec (HR, IT, READONLY, admin) vidí a mohou podepisovat vždy,
bez ohledu na to, jestli jsou v seznamu.

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
   podepsat). Zaškrtávátkem **„Přidat v zastoupení"** jde rovnou vybrat
   zodpovědnou osobu/odbor, za kterou bude přidaný člověk podepisovat –
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
všechny strany. Řádek podpisu zaměstnance na veřejném odkaze navíc smí
podepsat jen účet se stejným e-mailem, jaký má u odchodu uvedený
odcházející zaměstnanec – ne kterýkoli přihlášený uživatel z povolené
domény.

Vedoucí odboru podepisuje ve dvou místech: nahoře v hlavičce
(„Podpis vedoucího odboru") a u řádku „předávací protokol" v části A.
Tato dvě políčka jsou **propojená** – stačí podepsat (i v zastoupení)
kterékoli z nich a to druhé se automaticky označí jako podepsané stejnou
osobou; zrušení podpisu na jednom zruší i to druhé.

**Jak spravovat seznam osob k podpisu – „Osoby k podpisu":**

Vedle „Odeslat všem k podpisu" je samostatné tlačítko **„Osoby
k podpisu"**, které zobrazí aktuální uložený seznam bez nutnosti nic
znovu odesílat – u každého je vidět, kdy dostal pozvánku, a pokud
podepisuje v zastoupení, tak i za koho. Odsud jde:

- kohokoli **odebrat** (zrušit) – po potvrzení mu přestanou chodit
  automatické připomínky k podpisu tohoto výstupního listu a nesmí ho
  už ani podepsat (výstupní list přes svůj odkaz ale stále vidí).
  Odebraný člověk se nemaže, jen se přesune do části **„Zrušení
  příjemci"** níže, s poznámkou, kdy byl zrušen.
- **kdykoli vrátit** zrušeného člověka zpět tlačítkem **„Vrátit"** –
  obnoví se mu právo podepisovat a znovu mu budou chodit připomínky,
  ale **nová pozvánka se mu neposílá**.
- **přidat nového příjemce** (ručně, nebo tlačítkem „Vybrat ze
  zaměstnanců") – tomu se rovnou odešle nová pozvánka k podpisu a
  přidá se do seznamu. Zaškrtávátkem **„Přidat v zastoupení"** jde
  rovnou vybrat, za kterou zodpovědnou osobu/odbor bude podepisovat –
  dostane pak ten odlišný e-mail s pozvánkou pro zastoupení.

**Automatické upomínky na blížící se konec pracovního poměru** – dokud
je odchod jen **plánovaný** (skutečný konec ještě není potvrzený) a
výstupní list ještě není kompletně podepsaný, aplikace automaticky
30, 14, 7, 3, 2 a 1 den před plánovaným koncem:

- pošle **HR** souhrnnou upomínku – text se liší podle toho, jestli HR
  už vůbec jednou kliknula „Odeslat všem k podpisu" (pokud ne, HR se
  vyzve, ať to udělá; pokud ano, jen se připomene, že list stále čeká
  na podpis, a e-mail navíc obsahuje konkrétní seznam jmen a e-mailů,
  kdo přesně ještě nepodepsal),
- pošle **cílenou připomínku každému, kdo je v naposledy uloženém
  seznamu příjemců a ještě nepodepsal** – ne jen zaměstnanci a
  vedoucímu, ale komukoli, kdo v seznamu skutečně je,
- na stránce výstupního listu zobrazí barevný banner (žlutý do 7 dnů,
  červený v posledním týdnu nebo po termínu),
- každou odeslanou upomínku i uložení/úpravu seznamu příjemců zapíše
  do historie výstupního listu.

Jakmile se odchod potvrdí jako **skutečný**, tahle automatizace se pro
daný záznam úplně zastaví – smysl má jen dokud je odchod ještě
plánovaný a je čas věci stihnout podepsat.

Stejně jako u nástupů platí automatické informační propojení podle
osobního čísla s odpovídajícím nástupem.

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

### 5.4 Zaměstnanecké změny

**Jak založit změnu:** v menu **Změny** → nový záznam → zvolit typ
(změna jména, změna pozice, nebo obojí) → vyplnit osobní číslo a nové
údaje → uložit.

Změny jsou čistě **informační**: nikdy se nepropisují do nástupů ani
odchodů. Propojení podle osobního čísla slouží pouze k zobrazení, že u
dané osoby v minulosti proběhla i jiná změna.

### 5.5 Statistiky

Agregovaný pohled nad nástupy, odchody a změnami:

- **KPI karty** – např. počty nástupů/odchodů, čistý přírůstek, podíl
  odchodů ve zkušební době.
- **Hlavní grafy** – vývoj nástupů/odchodů v čase, fluktuace podle
  odboru, změny podle typu v čase.
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
- skupina příjemců – buď „vybraná skupina" (typicky plánované údaje),
  nebo „všichni zaměstnanci" (typicky skutečné údaje),
- u změn navíc typ změny, který má být do reportu zahrnut,
- forma odeslání – jeden souhrnný e-mail se všemi tabulkami pod
  sebou, nebo samostatné e-maily po jednotlivých typech.

Aplikace eviduje, které záznamy již byly v daném měsíci odeslány, a
před opětovným odesláním na to upozorní. Tento report smí **odeslat**
jen ADMIN, HR a IT – READONLY jej může prohlížet, ale ne odesílat
(narozdíl od exportu PDF u Statistik, který READONLY odeslat smí – viz
kapitola 3).

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
  osoby, nebo tlačítkem **„Poslat vše"** je všechny najednou odeslat na
  jeden zadaný e-mail.
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
- **Vyhodnocení zkušební doby**
  (`/vyhodnoceni-zkusebni-doby/[token]`) – nadřízený zde po
  přihlášení přes Google (ověřeném proti konkrétnímu zaměstnanci)
  vyplní hodnocení zkušební doby. Je-li potřeba i vyjádření
  tajemníka, otevře se mu po odeslání stejný odkaz s hlavičkou
  (koho se vyhodnocení týká), vyplněným hodnocením nadřízeného a
  odděleným rámečkem pro jeho vlastní vyjádření (souhlas/nesouhlas,
  komentář, podpis); ostatním (včetně původního nadřízeného) se po
  odeslání zobrazí jen potvrzení, ne obsah vyhodnocení. Jakmile
  tajemník své vyjádření odešle, dostane původní nadřízený e-mailem
  informaci, že se tajemník vyjádřil.

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

| Pojem                         | Význam                                                                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plánovaný** nástup/odchod   | Termín, který se má stát podle plánu, dosud nepotvrzen                                                                                                                                                                                                           |
| **Skutečný** nástup/odchod    | Termín potvrzený jako reálně proběhlý                                                                                                                                                                                                                            |
| **Výstupní list**             | Modální okno u odchodu se všemi akcemi k výstupnímu procesu (odeslání k podpisu, osoby k podpisu, PDF, zámek, historie)                                                                                                                                          |
| **Dokument výstupní list**    | Hlavní součást okna Výstupní list – strukturovaný dokument se sekcemi majetek, agenda, střet zájmů, podpis (v kódu appky označovaný jako „exit-checklist")                                                                                                       |
| **Osoby k podpisu**           | Skupina lidí (zaměstnanec, vedoucí, případně další signatáři, i v zastoupení), kterým HR naposledy poslala výstupní list k podpisu; podle ní se řídí cílené připomínky i to, kdo smí podepisovat – kdo z ní byl odebraný, nesmí podepsat, dokud není vrácen zpět |
| **Vyhodnocení zkušební doby** | Formulář hodnocení zaměstnance nadřízeným na konci zkušební doby                                                                                                                                                                                                 |
| **Vyjádření tajemníka**       | Druhá fáze vyhodnocení zkušební doby – tajemník úřadu se souhlasem/nesouhlasem, komentářem a podpisem vyjádří k doporučení nadřízeného, pokud jím není sám                                                                                                       |
| **Zaměstnanecká změna**       | Informační záznam o změně jména a/nebo pozice u stávajícího zaměstnance                                                                                                                                                                                          |
| **Osobní číslo**              | Identifikátor zaměstnance, podle kterého se automaticky propojují nástup a odchod                                                                                                                                                                                |
| **Upomínka na konec PP**      | Automatická e-mailová upomínka pro HR a pro osoby k podpisu, 30/14/7/3/2/1 den před **plánovaným** koncem pracovního poměru, pokud výstupní list ještě není hotový                                                                                               |
| **Smazané záznamy**           | Přehled smazaných nástupů/odchodů/změn s možností obnovení                                                                                                                                                                                                       |
