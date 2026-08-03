# Uživatelská příručka – On/Off-boarding aplikace

Interní HR aplikace Úřadu městské části Praha 6 pro evidenci nástupů,
odchodů a zaměstnaneckých změn, správu souvisejících dokumentů,
vyhodnocení zkušební doby a pravidelné reportování. Tato příručka je
určena uživatelům, kteří s aplikací teprve začínají – popisuje, co
aplikace umí, jakou má strukturu a kdo má do jednotlivých částí
přístup.

## Obsah

1. [K čemu aplikace slouží](#1-k-čemu-aplikace-slouží)
2. [Přístup do aplikace](#2-přístup-do-aplikace)
3. [Role a oprávnění](#3-role-a-oprávnění)
4. [Přehled adres (URL)](#4-přehled-adres-url)
5. [Moduly aplikace](#5-moduly-aplikace)
6. [Veřejné odkazy pro zaměstnance a nadřízené](#6-veřejné-odkazy-pro-zaměstnance-a-nadřízené)
7. [Historie a auditní stopa](#7-historie-a-auditní-stopa)
8. [Slovníček pojmů](#8-slovníček-pojmů)

## 1. K čemu aplikace slouží

Aplikace pokrývá celý životní cyklus pracovního poměru zaměstnance
úřadu z pohledu personální agendy:

- **Nástupy** – evidence nových zaměstnanců od plánovaného data
  nástupu po jeho potvrzení.
- **Odchody** – evidence ukončení pracovního poměru včetně výstupních
  formalit.
- **Zaměstnanecké změny** – evidence změn u stávajících zaměstnanců
  (změna jména, změna pozice, případně obojí).
- **Dokumenty** – osobní dotazník, čestné prohlášení, doklady o
  vzdělání a praxi, mzdové údaje – vyplňované v souvislosti s
  nástupem.
- **Vyhodnocení zkušební doby** – formulář, který na konci zkušební
  doby vyplňuje nadřízený zaměstnance.
- **E-mailové reporty** – pravidelné souhrnné přehledy nástupů,
  odchodů a změn odesílané vedení a dotčeným kolegům.
- **Statistiky** – agregované ukazatele a grafy nad celou agendou.

Napříč aplikací se důsledně rozlišuje **plánovaný** a **skutečný**
stav. Plánovaný údaj popisuje, co se má stát (např. plánovaný nástup),
skutečný údaj popisuje, co se doopravdy stalo a bylo v aplikaci
potvrzeno (např. skutečný nástup). Toto rozlišení se promítá do
evidence, kalendáře i reportů.

## 2. Přístup do aplikace

Přihlášení probíhá výhradně přes **Google účet** organizace, tlačítkem
„Přihlásit se přes Google“ na úvodní obrazovce (`/signin`). Aplikace
nemá samostatné heslo ani registraci.

Přihlásit se může pouze účet z povolené domény:

- **@praha6.cz** – organizační doména úřadu,

Účty z jiných domén se přihlásit nemohou.

Nová `@praha6.cz` osoba, která se přihlásí poprvé, dostane výchozí
roli **USER** – tedy bez přístupu do vnitřní části aplikace, dokud jí
administrátor roli ručně nezvýší (viz kapitola 3). Pokud se takový
uživatel pokusí vstoupit do aplikace, uvidí stránku „Nemáte přístup do
aplikace“ s pokynem kontaktovat administrátorku aplikace.

## 3. Role a oprávnění

Roli přiděluje **administrátor** v sekci *Administrace*
(`/admin`, dostupná jen roli ADMIN). Aplikace rozlišuje pět rolí:

| Role | Typický uživatel | Přístup do vnitřní aplikace |
|---|---|---|
| **ADMIN** | Správce aplikace | Ano – neomezený, včetně správy uživatelů a rolí |
| **HR** | Personální oddělení | Ano – plný rozsah běžné agendy |
| **IT** | IT oddělení | Ano – plný rozsah běžné agendy |
| **READONLY** | Vedení, kontrolní role | Ano – jen prohlížení a odesílání reportů |
| **USER** | Ostatní zaměstnanci | Ne – pouze veřejné odkazy zaslané e-mailem |

### Přehled oprávnění podle modulů

„Č“ = čtení/prohlížení, „Č + Z“ = čtení i zápis (vytváření, úpravy,
odesílání e-mailů).

| Modul | ADMIN | HR | IT | READONLY | USER |
|---|---|---|---|---|---|
| Přehled (kalendář) | Č + Z | Č + Z | Č + Z | Č | – |
| Nástupy / Odchody | Č + Z | Č + Z | Č + Z | Č | – |
| Zaměstnanecké změny | Č + Z | Č + Z | Č + Z | Č | – |
| Interní dokumenty | Č + Z | Č + Z | Č + Z | – | – |
| Vyhodnocení zkušební doby (interní správa) | Č + Z | Č + Z | Č + Z | – | – |
| Exit checklist | Č + Z | Č + Z | Č + Z | Podpis | Podpis¹ |
| E-mailové reporty (přehled, odeslání) | Č + Z | Č + Z | Č + Z | Č + Z | – |
| Statistiky (prohlížení, export, odeslání PDF) | Č + Z | Č + Z | Č + Z | Č + Z | – |
| Statistiky (uložení/smazání vlastního pohledu) | Č + Z | Č + Z | Č + Z | – | – |
| Administrace (uživatelé a role) | Č + Z | – | – | – | – |
| Nastavení | Č + Z | – | – | – | – |

¹ Zaměstnanec/nadřízený bez role v aplikaci má k exit checklistu
přístup pouze přes veřejný odkaz zaslaný e-mailem, ne přes vnitřní
aplikaci – viz kapitola 6.

### Shrnutí rolí

- **ADMIN** – jediná role s přístupem do Administrace (správa
  uživatelů a rolí) a do Nastavení; jinak má stejná práva jako HR/IT.
- **HR** a **IT** – v běžné agendě mají prakticky shodná plná práva
  (evidence, dokumenty, zkušební doba, exit checklist, reporty,
  statistiky); liší se od ADMIN pouze v tom, že nemají přístup do
  Administrace a Nastavení.
- **READONLY** – prohlíží nástupy, odchody, změny, exit checklist a
  statistiky, ale nezasahuje do jejich obsahu; smí odesílat
  e-mailové reporty a podepisovat exit checklist.
- **USER** – do vnitřní aplikace se vůbec nedostane; pracuje výhradně
  s jednorázovými veřejnými odkazy, které dostane e-mailem.

## 4. Přehled adres (URL)

### Přihlášení

| Adresa | Popis | Přístup |
|---|---|---|
| `/signin` | Přihlášení přes Google | Veřejné |
| `/no-access` | Informace o chybějícím přístupu | Přihlášené účty bez role |

### Hlavní agenda

| Adresa | Popis | Přístup |
|---|---|---|
| `/prehled` | Kalendářní přehled nástupů a odchodů, výchozí stránka po přihlášení | ADMIN, HR, IT, READONLY |
| `/nastupy` | Seznam nástupů (plánované i skutečné) | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]` | Detail konkrétního nástupu | ADMIN, HR, IT, READONLY |
| `/nastupy/[id]/editovat` | Úprava nástupu | ADMIN, HR, IT |
| `/nastupy/[id]/vyhodnoceni-zkusebni-doby` | Interní správa vyhodnocení zkušební doby k danému nástupu | ADMIN, HR, IT |
| `/odchody` | Seznam odchodů (plánované i skutečné) | ADMIN, HR, IT, READONLY |
| `/odchody/[id]` | Detail konkrétního odchodu, včetně exit checklistu | ADMIN, HR, IT, READONLY |
| `/odchody/[id]/editovat` | Úprava odchodu | ADMIN, HR, IT |
| `/odchody/[id]/vystupni-list` | Výstupní list k odchodu | ADMIN, HR, IT, READONLY |
| `/zmeny` | Seznam zaměstnaneckých změn | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]` | Detail konkrétní změny | ADMIN, HR, IT, READONLY |
| `/zmeny/[id]/editovat` | Úprava změny | ADMIN, HR, IT |
| `/dokumenty/internal/[id]` | Interní správa dokumentu (generování, zámek, odeslání) | ADMIN, HR, IT |

### Systém

| Adresa | Popis | Přístup |
|---|---|---|
| `/statistiky` | Agregované ukazatele, grafy a vlastní pohledy | ADMIN, HR, IT, READONLY |
| `/admin` | Správa uživatelů a jejich rolí | ADMIN |
| `/nastaveni` | Základní nastavení účtu administrátora | ADMIN |

### Veřejné odkazy (bez přihlášení do vnitřní aplikace)

| Adresa | Popis | Přístup |
|---|---|---|
| `/dokumenty/[hash]` | Vyplnění osobních dokumentů zaměstnancem | Odkaz z e-mailu |
| `/odchody-public/[token]` | Vyplnění a podpis exit checklistu | Odkaz z e-mailu |
| `/vyhodnoceni-zkusebni-doby/[token]` | Vyplnění hodnocení zkušební doby nadřízeným | Odkaz z e-mailu + Google přihlášení |

Adresy ve tvaru `[id]`, `[hash]` a `[token]` jsou vždy vázané na
konkrétní záznam – nejde o pevné, zapamatovatelné odkazy, ale o adresy
generované aplikací pro daný nástup, odchod, dokument apod.

## 5. Moduly aplikace

### 5.1 Přehled

Kalendář (zobrazení měsíc/týden/den) se všemi plánovanými i
skutečnými nástupy a odchody, barevně rozlišenými podle typu události.
Kliknutím na existující událost lze potvrdit skutečný nástup/odchod
nebo otevřít záznam k úpravě; kliknutím do volného místa v kalendáři
lze rovnou založit nový nástup nebo odchod.

### 5.2 Nástupy

Evidence nových zaměstnanců, odděleně podle toho, zda jde o
**plánovaný** nástup (dosud neproběhl) nebo **skutečný** (již
potvrzen). U každého nástupu se eviduje osobní číslo, pozice,
odbor/oddělení a další identifikační údaje. Z detailu nástupu se dále
řídí:

- **Interní dokumenty** – osobní dotazník, čestné prohlášení, doklady
  o vzdělání a praxi, mzdové údaje. Dokumenty lze vyplnit přímo
  v aplikaci, nebo zaměstnanci zaslat odkaz či PDF e-mailem k
  samostatnému vyplnění (kapitola 6).
- **Vyhodnocení zkušební doby** – formulář vyplňovaný nadřízeným
  zaměstnance na konci zkušební doby, prostřednictvím veřejného
  odkazu (kapitola 6). HR/IT v aplikaci sledují stav, odesílají
  pozvánku i upomínky a po vyplnění mohou formulář znovu odemknout
  k opravě.

Pokud se k danému osobnímu číslu později objeví i odpovídající
odchod, aplikace záznamy **automaticky propojí** – u nástupu se pak
zobrazí informace o odchodu a případně se zastaví sledování zkušební
doby. Jde výhradně o informační propojení; žádná data se mezi
nástupem a odchodem nepřepisují.

### 5.3 Odchody

Obdoba nástupů pro ukončení pracovního poměru, opět odděleně
plánované a skutečné. Z detailu odchodu se dále řídí:

- **Výstupní list** – souhrnný dokument k odchodu.
- **Exit checklist** – strukturovaný výstupní proces se sekcemi:
  - vrácení majetku a vybavení,
  - předání agendy (komu a co),
  - střet zájmů,
  - podpis nadřízeného.

  Checklist se částečně vyplňuje interně (HR/IT), částečně jej
  vyplňuje a podepisuje sám odcházející zaměstnanec nebo jeho
  nadřízený prostřednictvím veřejného odkazu (kapitola 6).

Stejně jako u nástupů platí automatické informační propojení podle
osobního čísla s odpovídajícím nástupem.

### 5.4 Zaměstnanecké změny

Evidence změn u stávajících zaměstnanců – změna jména, změna pozice,
nebo obojí současně. Změny jsou čistě **informační**: nikdy se
nepropisují do nástupů ani odchodů. Propojení podle osobního čísla
slouží pouze k zobrazení, že u dané osoby v minulosti proběhla i jiná
změna.

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
  znovu načíst.
- **Export a odeslání** – vybraný obsah lze stáhnout nebo odeslat
  e-mailem jako PDF.

### 5.6 E-mailové reporty

Z Nástupů, Odchodů i Změn lze otevřít společné okno pro odeslání
souhrnného e-mailu. V něm se volí:

- jeden nebo více měsíců současně,
- skupina příjemců – buď „vybraná skupina“ (typicky plánované údaje),
  nebo „všichni zaměstnanci“ (typicky skutečné údaje),
- u změn navíc typ změny, který má být do reportu zahrnut,
- forma odeslání – jeden souhrnný e-mail se všemi tabulkami pod
  sebou, nebo samostatné e-maily po jednotlivých typech.

Aplikace eviduje, které záznamy již byly v daném měsíci odeslány, a
před opětovným odesláním na to upozorní.

## 6. Veřejné odkazy pro zaměstnance a nadřízené

Část procesu probíhá mimo vnitřní aplikaci – zaměstnanec nebo
nadřízený obdrží e-mailem jednorázový odkaz vázaný na konkrétní
záznam, na kterém nepotřebuje mít v aplikaci účet ani roli:

- **Vyplnění osobních dokumentů** (`/dokumenty/[hash]`) – nový
  zaměstnanec zde vyplní osobní dotazník, čestné prohlášení a další
  podklady k nástupu.
- **Exit checklist** (`/odchody-public/[token]`) – odcházející
  zaměstnanec nebo jeho nadřízený zde potvrdí vrácení majetku,
  předání agendy a podepíše výstup.
- **Vyhodnocení zkušební doby**
  (`/vyhodnoceni-zkusebni-doby/[token]`) – nadřízený zde po
  přihlášení přes Google (ověřeném proti konkrétnímu zaměstnanci)
  vyplní hodnocení zkušební doby.

Tyto odkazy platí vždy jen pro daný záznam. Po vyplnění nebo podpisu
je možné formulář v aplikaci znovu uzamknout, případně odemknout
k opravě.

## 7. Historie a auditní stopa

Ke každému nástupu, odchodu, změně i dokumentu aplikace vede historii
– kdo, kdy a jakou akci provedl (vytvoření, úprava, smazání, obnovení,
odeslání e-mailu apod.). Historii lze zobrazit přímo u konkrétního
záznamu i souhrnně u reportů, tlačítkem „Historie“.

## 8. Slovníček pojmů

| Pojem | Význam |
|---|---|
| **Plánovaný** nástup/odchod | Termín, který se má stát podle plánu, dosud nepotvrzen |
| **Skutečný** nástup/odchod | Termín potvrzený jako reálně proběhlý |
| **Exit checklist** | Strukturovaný výstupní proces při odchodu (majetek, agenda, střet zájmů, podpis) |
| **Vyhodnocení zkušební doby** | Formulář hodnocení zaměstnance nadřízeným na konci zkušební doby |
| **Zaměstnanecká změna** | Informační záznam o změně jména a/nebo pozice u stávajícího zaměstnance |
| **Osobní číslo** | Identifikátor zaměstnance, podle kterého se automaticky propojují nástup a odchod |
