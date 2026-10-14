# Crony, e-mailová fronta a technické přístupy

Tento dokument popisuje, k čemu v aplikaci slouží cron endpointy, jak funguje e-mailová fronta, jaké proměnné prostředí je potřeba nastavit, jaká technická oprávnění jsou potřeba a jak ověřit, že je vše správně zapojené.

Dokument je určený pro převzetí, nasazení nebo kontrolu aplikace v jiném prostředí, aby bylo jasné, co je potřeba nastavit mimo samotný kód v GitHubu.

---

## 1. Shrnutí

Aplikace používá cron endpointy pro automatické hlídání vypršení odkazů k vyplnění nástupních dokumentů, blížícího se konce pracovního poměru a pro odesílání e-mailů z fronty. Automatika k vyhodnocení zkušební doby je od verze 0.14.0 dočasně vypnutá (bude řešena přes jinou aplikaci) – viz kapitola 2.1.

Crony se nespouští samy od sebe jen tím, že existuje kód v repozitáři. Musí je volat externí plánovač, například:

- GitHub Actions,
- hostingový scheduler,
- serverový cron,
- ruční HTTP request při testování.

Cron endpointy jsou chráněné přes `CRON_SECRET`. To znamená, že volající systém musí znát stejný secret, jaký má nastavený běžící aplikace ve svém prostředí.

Zjednodušený tok:

1. Cron `probation-notifications` projde nástupní dokumenty a hlídá vypršení odkazů k jejich vyplnění (automatika zkušební doby je dočasně vypnutá, viz kapitola 2.1).
2. Cron `offboarding-notifications` projde plánované odchody (dosud bez potvrzeného skutečného konce) a blížící se konec pracovního poměru u nedokončených výstupních listů.
3. Podle pravidel oba vytvoří e-mailové úlohy v tabulce `MailQueue`.
4. Cron `mail-worker` zpracuje čekající položky z `MailQueue`.
5. Mail worker odešle e-maily přes Resend.
6. Stav odeslání nebo chyba se zapíše do databáze / historie.

Oba kontrolní crony běží jen jednou denně, v 8:00 pražského času – viz kapitola 8.1 a 8.2 k tomu, proč mají v GitHub Actions dvě UTC schedule hodnoty.

---

## 2. Hlavní cron endpointy

### 2.1 Kontrola vypršení odkazů k vyplnění nástupních dokumentů

```txt
GET /api/cron/probation-notifications
```

Název endpointu je historický – původně kontroloval jen zkušební doby.
Od verze 0.14.0 je automatika k vyhodnocení zkušební doby (logika v
`@/lib/probation-cron-jobs`) z tohoto endpointu odebraná a dočasně
vypnutá, protože bude řešena přes jinou aplikaci. Samotná logika v
kódu zůstala beze změny, jen se nevolá – pro obnovení stačí
odkomentovat import a volání v
`src/app/api/cron/probation-notifications/route.ts`. E-mailové šablony
a zbytek logiky k vyhodnocení zkušební doby (finální PDF, vyjádření
tajemníka) zůstávají funkční a dál se používají při ručním odeslání
(viz kapitola 11), jen se automaticky nezakládají nové pozvánky ani
připomínky k vyplnění.

Tento endpoint teď na stejném denním spouštění hlídá vypršení odkazů
k vyplnění nástupních dokumentů (čestné prohlášení, osobní dotazník,
dotazník pro mzdovou agendu) – logika v
`@/lib/employment-document-cron-jobs`.

Typicky zajišťuje:

- **3 dny před vypršením** odkazu k vyplnění pošle upozornění přímo
  zaměstnanci na e-mail uvedený v nástupu, s odkazy na dosud
  nevyplněné dokumenty,
- **v den vypršení**, pokud dokument pořád není vyplněný, pošle
  upozornění Personálnímu oddělení,
- **3 dny před plánovaným nástupem** (i zpětně, pokud je nástup už po
  termínu) pošle upozornění Personálnímu oddělení na dokumenty, které
  ještě vůbec nebyly zaměstnanci odeslány (`sentAt` je `null`) –
  dokument sice i bez odeslání má `expiresAt` (nastavuje se hned při
  vytvoření, na 14 dní dopředu), ale tahle připomínka na vypršení
  nehledí, protože smysl má odeslat i dokument, jehož časové okno už
  doběhlo (prostě se u něj nejdřív musí vygenerovat nový odkaz),
- ostatní dvě připomínky výše počítají jen u dokumentů, které už byly
  opravdu odeslány (`sentAt` vyplněné) – dokument jen založený, ale
  neodeslaný, tam cron nehlídá (na to je právě předchozí bod),
- e-maily posílá přímo (synchronně), ne přes `MailQueue` – idempotence
  (aby se stejná připomínka neposlala dvakrát) je řešená přes historii
  dokumentu (`EmploymentDocumentEvent`), ne přes frontu. Počítá se
  vždy jen od posledního vytvoření/obnovení odkazu (`CREATED`/
  `REGENERATED` událost) – po vygenerování nového odkazu se tak
  počítání připomínek vynuluje a stejný typ připomínky může přijít
  znovu pro nový cyklus.

Důležité: na rozdíl od dřívějšího chování k zkušební době tento
endpoint e-maily posílá přímo, ne přes e-mailovou frontu.

---

### 2.2 Kontrola blížícího se konce pracovního poměru

```txt
GET /api/cron/offboarding-notifications
```

Tento endpoint kontroluje **plánované** odchody (`plannedEnd`), u
kterých ještě **není** vyplněné skutečné datum konce (`actualEnd`
musí být `null`). Jakmile se odchod potvrdí jako skutečný
(`actualEnd` se vyplní), cron ho od té chvíle úplně přeskočí – jakmile
člověk skutečně odešel, další upomínky na podpis výstupního listu už
nemají smysl. Je to záměrně opačná logika než u nástupů (tam se
zkušební doba řeší až po potvrzení skutečného nástupu).

Řeší dva samostatné typy připomínek, vždy nejvýš jednou za dané okno a
daný odchod:

**A) Kontrola před odesláním pozvánek k podpisu** (typ úlohy
`NOTICE_WARNING`, funkce `queueExitChecklistSetupReminders`) – hlídá,
jestli má HR před prvním odeslání pozvánek vyplněné dvě povinné věci:
vedoucího odboru a rozhodnutý střet zájmů (rozhoduje se výhradně
v okně "Osoby k podpisu výstupního listu", viz kapitola 11.6):

- dohledá plánované odchody (bez `actualEnd`, bez `cancelledAt`),
  kterým ještě nikdy nebyla odeslána žádná pozvánka k podpisu
  (`signatureRecipientsSentAt` je prázdné) – jakmile HR poprvé odešle
  pozvánky, tato kontrola se pro daný odchod už nikdy znovu nespustí,
- u krátké výpovědní doby (`noticeMonths < 2` nebo vlastní zadaná
  data, `hasCustomDates`) běží kontrola každý den cronu bez ohledu na
  datum; jinak teprve od okamžiku, kdy do plánovaného konce zbývá
  **1 měsíc** nebo méně,
- pokud chybí vedoucí odboru a/nebo není rozhodnutý střet zájmů,
  zařadí HR jeden souhrnný e-mail s výčtem, co konkrétně chybí
  doplnit – nejvýš jednou za den a daný odchod,
- příjemci jsou `HR_EMAILS`,
- zápis události `DEADLINE_REMINDER_SENT` do historie výstupního
  listu, včetně `meta.missing` s výčtem chybějících věcí.

**B) Cílená připomínka konkrétním lidem + souhrnný report pro HR**
(typ úlohy `EXIT_SIGNATURE_INVITE` pro podepisující, `NOTICE_WARNING`
pro HR report, funkce `queueExitChecklistSignatureReminders`) –
v okamžicích **14, 7, 5, 3, 2, 1 a 0 dní** před plánovaným koncem:

- pro každý nedokončený odchod se podívá na **uloženou skupinu
  příjemců** (`ExitChecklist.header.signatureRecipients`) – tedy
  přesně ten seznam lidí, kterým bylo kdy odesláno k podpisu. Skupina
  se nepřepisuje jen přes dialog "Osoby k podpisu výstupního listu"
  (viz kapitola 11.6, tam se dá i explicitně odebrat/zrušit), ale
  **doplňuje se automaticky** i každým jednotlivým odesláním tlačítkem
  "Odeslat k podpisu", "Odeslat k podpisu v zastoupení" nebo přidáním
  v okně "Osoby k podpisu" – žádná z těchto akcí zbytek skupiny
  nemaže, jen do ní přidává. Cron vždy reaguje na aktuální uložený
  stav, ne na historii všech dřívějších odeslání,
- příjemci s `revokedAt` (odebraní/zrušení – viz kapitola 11.6) se
  **přeskakují úplně**, žádná připomínka jim nechodí, dokud nejsou
  vráceni zpět,
- stejný e-mail může být ve skupině ve dvou nezávislých rolích zároveň
  (přímo za sebe a k tomu v zastoupení za jinou osobu/odbor) – cron je
  vyhodnocuje **odděleně** (podle dvojice e-mail + role v zastoupení),
  takže vyřízení jedné role stejného člověka neovlivní tu druhou,
- u každého člověka ze skupiny zjistí, jestli má ještě co podepsat a
  jakou roli u toho zastává (`resolveSignatureRecipientStatus`):
  zastoupení za vedoucího se posuzuje úplně stejně jako vedoucí sám
  (musí podepsat hlavičku i sekci C), zaměstnanec podle svého
  hlavičkového podpisu, vedoucí podle hlavičky **a** podpisu sekce C
  zároveň (`managerHasSigned` – dřív se kontrolovala jen hlavička),
  odpovědná osoba za sekci B podle podpisu vydávajícího v sekci B,
  funkční signatáři (SNEO, spisová služba, mzdová účtárna...) podle
  svých konkrétních řádků výstupního listu (uložené u nich jako
  `rowKeys`) – pokud má někdo přiřazeno víc řádků, musí mít podepsané
  úplně všechny, jinak se dál počítá jako nepodepsaný a připomínka mu
  chodí dál, ostatní obecně podle celkové kompletnosti,
- e-mail vede na stejný veřejný odkaz (`/odchody-public/[token]`),
  jaký dostali v původní pozvánce; podle role (zaměstnanec, vedoucí,
  odpovědná osoba za sekci B) obsahuje navíc zvýrazněnou poznámku, co
  konkrétně má dotyčný ještě vyřídit, a lidé přidaní "v zastoupení"
  mají v e-mailu i text "v zastoupení za…",
- zápis události `SIGNATURE_INVITE_SENT` do historie výstupního
  listu, s metadaty o tom, komu a kolik dní před koncem se poslalo,
- pokud na daný den zbyl alespoň jeden nepodepsaný příjemce, zařadí se
  navíc (nejvýš jednou za tento den a odchod) **jeden souhrnný report
  pro HR** se jmény a e-maily těch, co ještě nepodepsali – tento
  report **nahrazuje** dřívější samostatnou 30/14/7/3/2/1denní
  souhrnnou upomínku pro HR, žádné duplicitní e-maily se tedy
  neposílají.

**C) Potvrzení, že plánovaný odchod skutečně proběhl** (typ úlohy
`OFFBOARDING_DEPARTURE_CONFIRMATION`, funkce
`queueOffboardingDepartureConfirmations`) – přesně **1 den po**
plánovaném konci (`plannedEnd` padlo do včerejška), jednorázově:

- dohledá plánované odchody (bez `actualEnd`, bez `cancelledAt`),
  kterým právě včera uplynul plánovaný konec a nikdo v appce
  nepotvrdil, jestli k odchodu skutečně došlo,
- pošle HR (`HR_EMAILS`) jeden e-mail na zaměstnance s odkazem do
  přehledu Odchodů, kde je stejná situace zároveň vidět jako červený
  banner (s možností rovnou potvrdit nebo označit jako neuskutečněný,
  u více záznamů i hromadně),
- jde o jednorázovou připomínku vázanou na přesné okno "včera" – žádné
  další sledovací pole u odchodu pro to není potřeba, okno se samo
  druhý den uzavře.

Řádek podpisu zaměstnance na veřejném odkaze (`/odchody-public/[token]`)
navíc smí podepsat jen účet přihlášený přes Google se stejným e-mailem,
jaký má u odchodu uvedený odcházející zaměstnanec – ne kterýkoli
přihlášený uživatel z povolené domény jako dřív.

Endpoint stejně jako `probation-notifications` e-maily přímo
neposílá, pouze vytváří úlohy do `MailQueue` (`NOTICE_WARNING`,
`EXIT_SIGNATURE_INVITE` a `OFFBOARDING_DEPARTURE_CONFIRMATION`).

Na stránce výstupního listu (`/odchody/[id]/vystupni-list`) se navíc
nezávisle na cronu zobrazuje barevný banner (žlutý do 7 dnů, červený
0–7 dnů nebo po termínu), pokud checklist ještě není kompletní – ten
banner se počítá přímo při načtení stránky, ne z výsledku cronu.

---

### 2.3 Mail worker

```txt
GET /api/cron/mail-worker
```

Tento endpoint zpracovává e-mailovou frontu.

Typicky dělá:

- najde čekající záznamy v `MailQueue`,
- podle typu úlohy sestaví e-mail,
- odešle e-mail přes Resend,
- označí úlohu jako odeslanou,
- při chybě zapíše chybu do fronty / logu.

---

### 2.4 Obecný cron endpoint

```txt
GET /api/cron
```

Obecný endpoint může sloužit pro kompatibilitu nebo pro starší napojení.

Primárně je ale vhodné používat konkrétní endpointy:

```txt
/api/cron/probation-notifications
/api/cron/mail-worker
```

---

## 3. Bezpečnost cron endpointů

Cron endpointy nejsou autorizované přes běžné uživatelské role typu `HR`, `ADMIN`, `IT` nebo `READONLY`.

Cron se autorizuje technicky přes `CRON_SECRET`.

Každé volání cron endpointu musí obsahovat jeden z těchto HTTP headerů:

```txt
Authorization: Bearer <CRON_SECRET>
```

nebo alternativně:

```txt
x-cron-secret: <CRON_SECRET>
```

Příklad:

```bash
curl -fsS "https://url-aplikace.cz/api/cron/probation-notifications" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Pokud header chybí nebo secret nesedí, endpoint má vrátit chybu `401` nebo `403`.

---

## 4. Co znamenají „práva“ v kontextu cronů

V kontextu cronů nejde primárně o uživatelská práva v aplikaci, ale o technická oprávnění a přístupy potřebné k tomu, aby crony mohly běžet.

Je potřeba ověřit hlavně následující oblasti.

### 4.1 Přístup k ENV proměnným aplikace

Někdo musí mít možnost nastavit proměnné prostředí v místě, kde aplikace skutečně běží.

Může to být například:

- hosting,
- server,
- Docker kontejner,
- CI/CD prostředí,
- lokální `.env.local` při lokálním testování.

GitHub Secrets se automaticky nepřenášejí do běžící aplikace. Pokud je aplikace spuštěná jinde, musí mít vlastní ENV nastavené v daném prostředí.

### 4.2 Přístup do GitHub Actions Secrets

Pokud crony spouští GitHub Actions, musí mít repozitář nastavené secrets:

```env
APP_URL=...
CRON_SECRET=...
```

Hodnota `CRON_SECRET` v GitHubu musí být stejná jako hodnota `CRON_SECRET` v běžící aplikaci.

### 4.3 Přístup k běžící aplikaci

GitHub Actions nebo jiný scheduler musí být schopný zavolat veřejnou URL běžící aplikace.

Například:

```txt
https://url-aplikace.cz/api/cron/probation-notifications
https://url-aplikace.cz/api/cron/mail-worker
```

Pokud aplikace není veřejně dostupná, je potřeba cron spouštět ze stejné sítě nebo z prostředí, které má k aplikaci přístup.

### 4.4 Přístup k databázi

Crony pracují s databází.

Prostředí musí mít správně nastavenou `DATABASE_URL` a databáze musí obsahovat aktuální migrace.

Cron `probation-notifications` čte nástupní dokumenty (`EmploymentDocument`) a jejich stav odeslání/vyplnění; automatika k zkušební době je dočasně vypnutá (viz kapitola 2.1).

Cron `offboarding-notifications` čte plánované odchody (bez potvrzeného skutečného konce) a výstupní listy (exit checklist) – včetně uložené skupiny příjemců k podpisu (`ExitChecklist.header.signatureRecipients`) – a zapisuje do historie výstupního listu.

Cron `mail-worker` čte a aktualizuje `MailQueue`.

### 4.5 Přístup k e-mailové službě Resend

Pro odesílání e-mailů je potřeba:

- platný `RESEND_API_KEY`,
- správně nastavený `RESEND_EMAIL_FROM`,
- ověřená doména nebo odesílací adresa v Resendu,
- nastavení příjemců, například `HR_EMAILS`.

Pokud cron vytvoří úlohu do fronty, ale Resend není správně nastavený, mail worker nebude schopný e-mail odeslat.

### 4.6 Aplikační role

Běžné role v aplikaci zůstávají pro práci ve formulářích a interních obrazovkách:

- `ADMIN`, `HR`, `IT` mohou spravovat vyhodnocení,
- `READONLY` může pouze číst,
- veřejný formulář je dostupný přes token a přihlášení oprávněného uživatele.

Cron endpointy se ale neřídí těmito rolemi. Cron se ověřuje přes `CRON_SECRET`.

---

## 5. ENV proměnné v aplikaci

V prostředí, kde aplikace běží, musí být nastavené minimálně následující proměnné.

### 5.1 Cron a URL aplikace

```env
CRON_SECRET=dlouhy-nahodny-token
NEXT_PUBLIC_APP_URL=https://url-aplikace.cz
AUTH_URL=https://url-aplikace.cz
NEXTAUTH_URL=https://url-aplikace.cz
```

Poznámky:

- `CRON_SECRET` chrání cron endpointy.
- `NEXT_PUBLIC_APP_URL` se používá pro sestavování odkazů do aplikace.
- `AUTH_URL` / `NEXTAUTH_URL` musí odpovídat URL běžící aplikace.
- Podle použité verze Auth.js / NextAuth může být relevantní `AUTH_URL`, `NEXTAUTH_URL`, případně oboje. Bezpečné je mít nastavené oboje na stejnou URL.

### 5.2 E-mailové proměnné

```env
RESEND_API_KEY=...
RESEND_EMAIL_FROM=...
HR_EMAILS=hr1@praha6.cz,hr2@praha6.cz
```

Poznámky:

- `RESEND_API_KEY` je API klíč pro Resend.
- `RESEND_EMAIL_FROM` musí být adresa/doména povolená v Resendu.
- `HR_EMAILS` je seznam HR příjemců oddělený čárkou.

Volitelně, jen pro mail worker:

```env
MAIL_WORKER_BATCH_SIZE=20
```

Určuje, kolik položek z `MailQueue` mail worker zpracuje v jednom
běhu. Výchozí hodnota je 20, maximum 100.

### 5.3 Běžné aplikační proměnné

```env
DATABASE_URL=...
AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Poznámky:

- `DATABASE_URL` musí ukazovat na správnou databázi pro dané prostředí.
- `AUTH_SECRET` musí být samostatný náhodný secret. Nemá to být Google Client ID.
- `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET` jsou potřeba pro Google OAuth přihlášení.

Doporučené vygenerování `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Doporučené vygenerování `CRON_SECRET`:

```bash
openssl rand -base64 32
```

---

## 6. GitHub Actions Secrets

Pokud cron spouští GitHub Actions, musí být v GitHubu nastavené secrets.

Minimálně:

```env
APP_URL=https://url-bezici-aplikace.cz
CRON_SECRET=stejny-token-jako-v-env-aplikace
```

Důležité pravidlo:

```txt
CRON_SECRET v GitHub Actions musí být stejný jako CRON_SECRET v ENV běžící aplikace.
```

GitHub Actions funguje pouze jako externí volající. Zavolá URL aplikace a pošle jí token v headeru.

GitHub Secrets se automaticky nepoužijí:

- při lokálním spuštění aplikace,
- na hostingu,
- na serveru,
- v Docker kontejneru,
- v jiném CI/CD prostředí.

Každé prostředí musí mít svoje vlastní ENV.

---

## 7. DEV a PROD prostředí

Doporučuje se mít oddělené hodnoty pro DEV a PROD.

### 7.1 DEV

```env
APP_URL=https://dev-url-aplikace.cz
CRON_SECRET=dev-dlouhy-secret
```

### 7.2 PROD

```env
APP_URL=https://produkce-url-aplikace.cz
CRON_SECRET=prod-dlouhy-secret
```

Nedoporučuje se používat stejný `CRON_SECRET` pro DEV i PROD.

### 7.3 Možnosti nastavení v GitHubu

Existují dvě praktické varianty.

#### Varianta A: GitHub Environments

V GitHubu se vytvoří environments například:

- `dev`,
- `production`.

V každém environmentu mohou být secrets se stejným názvem, ale s jinou hodnotou:

```env
APP_URL=...
CRON_SECRET=...
```

Workflow potom musí mít u jobu uvedeno například:

```yml
environment: production
```

Bez uvedení environmentu si job nevezme environment secrets.

#### Varianta B: samostatné názvy secrets

V GitHubu se nastaví například:

```env
DEV_APP_URL=...
DEV_CRON_SECRET=...
PROD_APP_URL=...
PROD_CRON_SECRET=...
```

Workflow potom musí používat odpovídající názvy secrets.

---

## 8. Příklad GitHub Actions workflow

### 8.1 Kontrola zkušebních dob

Skutečný soubor v repozitáři:

```txt
.github/workflows/probation-cron.yml
```

Příklad:

```yml
name: Probation Check

on:
  schedule:
    - cron: "0 6,7 * * *"
  workflow_dispatch:

jobs:
  probation-check:
    runs-on: ubuntu-latest
    steps:
      - name: Call probation notifications cron
        run: |
          curl -fsS -X POST "$APP_URL/api/cron/probation-notifications" \
            -H "Authorization: Bearer $CRON_SECRET"
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

Poznámka: čas v GitHub Actions cron zápisu je v UTC a nezná časové
pásmo. Endpoint má uvnitř běžet jen v 8:00 pražského času, proto se
schedule spouští ve dvou UTC hodnotách najednou (`6,7`) – jedna
odpovídá 8:00 v létě (CEST), druhá v zimě (CET). Endpoint
(`isLocalHourNow(8)`) si podle skutečného pražského času sám vybere,
který běh proběhne a který jen vrátí `status: "skipped"`. Bez
parametru `force=true` se tak nikdy nespustí dvakrát za den.

---

### 8.2 Kontrola blížícího se konce pracovního poměru

Skutečný soubor v repozitáři:

```txt
.github/workflows/offboarding-cron.yml
```

Stejná struktura a stejné DST zdůvodnění jako u 8.1, jiný endpoint:

```yml
name: Offboarding Check

on:
  schedule:
    - cron: "0 6,7 * * *"
  workflow_dispatch:

jobs:
  offboarding-check:
    runs-on: ubuntu-latest
    steps:
      - name: Call offboarding notifications cron
        run: |
          curl -fsS -X POST "$APP_URL/api/cron/offboarding-notifications" \
            -H "Authorization: Bearer $CRON_SECRET"
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

---

### 8.3 Mail worker

Soubor například:

```txt
.github/workflows/mail-worker.yml
```

Příklad:

```yml
name: Mail Worker

on:
  schedule:
    - cron: "10 6-17 * * *"
  workflow_dispatch:

jobs:
  mail-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Call mail worker cron
        run: |
          curl -fsS "$APP_URL/api/cron/mail-worker" \
            -H "Authorization: Bearer $CRON_SECRET"
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

Tento příklad spouští mail worker každou hodinu v rozmezí 6–17 UTC.

---

## 9. Ruční testování cron endpointů

### 9.1 Test kontroly zkušebních dob

```bash
curl -fsS "https://url-aplikace.cz/api/cron/probation-notifications" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### 9.2 Test kontroly blížícího se konce pracovního poměru

```bash
curl -fsS "https://url-aplikace.cz/api/cron/offboarding-notifications" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### 9.3 Test mail workeru

```bash
curl -fsS "https://url-aplikace.cz/api/cron/mail-worker" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### 9.4 Lokální test

V `.env.local` musí být například:

```env
CRON_SECRET=local-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

Potom lze volat:

```bash
curl -fsS "http://localhost:3000/api/cron/probation-notifications" \
  -H "Authorization: Bearer local-secret"
```

nebo:

```bash
curl -fsS "http://localhost:3000/api/cron/mail-worker" \
  -H "Authorization: Bearer local-secret"
```

---

## 10. E-mailová fronta `MailQueue`

E-mailová fronta slouží k oddělení vytvoření e-mailové úlohy od samotného odeslání.

Typický tok:

1. Cron nebo aplikační akce vytvoří záznam v `MailQueue`.
2. Záznam má typ e-mailu, payload a stav.
3. Mail worker najde čekající záznamy.
4. Podle typu e-mailu zavolá odpovídající odesílací funkci.
5. Po úspěchu označí záznam jako odeslaný.
6. Při chybě zapíše chybu a podle nastavení může dojít k opakování.

Typické probation e-mailové typy:

```txt
PROBATION_EVALUATION_INVITE
PROBATION_EVALUATION_REMINDER
PROBATION_EVALUATION_HR_INFO
PROBATION_EVALUATION_HR_MISSING_SUPERVISOR
PROBATION_EVALUATION_HR_NOT_COMPLETED
PROBATION_EVALUATION_UNLOCK_REMINDER
```

Typy e-mailů pro blížící se konec pracovního poměru:

```txt
NOTICE_WARNING
EXIT_SIGNATURE_INVITE
```

Oba typy vytváří `offboarding-notifications` a zpracovává je stejný
`mail-worker` jako probation typy.

- `NOTICE_WARNING` – souhrnná připomínka pro HR. Payload obsahuje
  mimo jiné `recipients`, `employeeName`, `daysBeforeEnd`,
  `checklistLink`, `subject` a `intro`.
- `EXIT_SIGNATURE_INVITE` – cílená připomínka konkrétnímu člověku
  (zaměstnanci nebo vedoucímu), který ještě nepodepsal. Payload
  obsahuje `to`, `employeeName`, `employeePosition`,
  `employeeDepartment`, `employmentEndDate` a `signUrl` – zpracovává
  se stejnou funkcí jako ruční pozvánka k podpisu
  (`sendSignatureInviteEmail`), jen ho místo HR založí cron.

Finální PDF vyplněného formuláře se neposílá přes běžnou frontu. Viz další kapitola.

---

## 11. Finální vyhodnocení zkušební doby a PDF pro HR

Finální uložení vyhodnocení zkušební doby funguje jinak než běžné cron e-maily.

Při finálním uložení aplikace:

1. uloží vyplněné vyhodnocení,
2. označí request jako `COMPLETED`,
3. vytvoří aktivní záznam vyhodnocení,
4. vygeneruje PDF,
5. odešle PDF na HR,
6. zapíše událost do historie.

Toto se děje přímo při finálním uložení formuláře, protože e-mail obsahuje aktuálně vygenerovanou PDF přílohu.

### 11.1 Rozpracované uložení

Rozpracované uložení formuláře pouze uloží data.

Nemá:

- odesílat e-mail,
- generovat PDF,
- zobrazovat hlášku, že e-mail byl odeslán,
- uzavírat formulář jako dokončený.

### 11.2 Finální uložení

Finální uložení:

- uloží formulář jako dokončený,
- vygeneruje PDF,
- odešle PDF na HR,
- zobrazí úspěšnou hlášku.

### 11.3 Revize / uložení změn

Pokud je již dokončený formulář otevřený k úpravě:

- po kliknutí na „Otevřít k úpravě“ má uživatel zůstat ve formuláři,
- po kliknutí na „Uložit změny“ se revize uloží,
- formulář se znovu uzavře,
- vygeneruje se nové PDF,
- aktuální PDF se znovu odešle HR,
- změna se zapíše do historie.

### 11.4 Vyjádření tajemníka – kompletní přehled, kdo dostane co a kdy

Pokud vedoucí, který vyhodnocení zkušební doby vyplňuje, **není sám
tajemník úřadu** (podle EOS, případně podle ručního přepisu tajemníka
v nastavení), přidává se k finálnímu vyhodnocení druhá fáze. Vše níže
se odesílá **přímo při dané akci, mimo `MailQueue`** – stejně jako
finální PDF v kapitole 11.2.

**Krok 1 – vedoucí odešle finální vyhodnocení**

| Komu             | Co dostane                                                                                                                                                           | Kdy                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| HR (`HR_EMAILS`) | E-mail s vygenerovaným PDF v příloze. Pokud je potřeba vyjádření tajemníka, text navíc uvádí, že vyhodnocení bylo zároveň odesláno tajemníkovi (jménem) k vyjádření. | Ihned po finálním uložení vedoucím                                            |
| Tajemník úřadu   | E-mail s PDF v příloze a odkazem „Otevřít k vyjádření“ na stejný veřejný token, jaký měl vedoucí.                                                                    | Ihned po finálním uložení vedoucím (jen pokud je vyjádření tajemníka potřeba) |

Pokud je vedoucí sám tajemníkem, tento krok 2 se přeskočí – HR dostane
jen běžný e-mail z kroku 1, PDF neobsahuje druhou sekci.

**Krok 2 – tajemník odešle své vyjádření (souhlas/nesouhlas, komentář, podpis)**

| Komu                            | Co dostane                                                                                                                                                                                               | Kdy                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| HR (`HR_EMAILS`)                | Nový e-mail s aktualizovaným PDF (obsahuje i sekci „Vyjádření tajemníka“). V textu e-mailu jsou **obě stanoviska najednou** – doporučení vedoucího (ANO/NE) i vyjádření tajemníka (souhlasí/nesouhlasí). | Ihned po odeslání vyjádření tajemníkem |
| Vedoucí, který formulář vyplnil | Samostatný e-mail s informací, že se tajemník vyjádřil a jestli souhlasí, nebo nesouhlasí, včetně finálního PDF v příloze.                                                                               | Ihned po odeslání vyjádření tajemníkem |

Pokud u odchozího/vedoucího chybí e-mail (`supervisorEmail`), tento
druhý e-mail se přeskočí – posílá se jen HR e-mail s PDF.

**Krok 3 – revize (HR formulář znovu odemkne, někdo ho upraví)**

| Komu             | Co dostane                                     | Kdy                     |
| ---------------- | ---------------------------------------------- | ----------------------- |
| HR (`HR_EMAILS`) | Nový e-mail s aktuálním PDF po uložení revize. | Ihned po uložení revize |

Revize sama o sobě neposílá nic tajemníkovi ani vedoucímu – jen HR.

**Informační tabulka v e-mailech.** Všechny e-maily v krocích 1–3
(pozvánka, připomínka, HR upomínka, PDF pro HR, žádost tajemníkovi,
notifikace vedoucímu) mají ve své informační tabulce na konci řádek
„Vedoucí / hodnotitel“ a „E-mail vedoucího“ – jméno a e-mail toho, kdo
formulář vyplnil.

**PDF.** Doporučení vedoucího odboru (ANO/NE, důvod) a vyjádření
tajemníka (souhlasí/nesouhlasí, komentář) jsou v PDF každé ve vlastním
ohraničeném rámečku, s podpisem a časem podpisu vpravo. Pokud vyjádření
tajemníka není potřeba, PDF obsahuje jen první rámeček.

**Kde se dá zjistit, co a komu bylo odesláno.** Historie vyhodnocení
zkušební doby (`ProbationEvaluationEvent`, akce
`TAJEMNIK_REVIEW_SENT` / `TAJEMNIK_REVIEWED` / `HR_INFO_SENT` /
`EMAIL_FAILED`) – zobrazuje se přímo u detailu vyhodnocení v interní
aplikaci.

---

### 11.5 Dokončení výstupního listu (exit checklist)

Stejný princip – mimo `MailQueue`, přímo v okamžiku dokončení – platí
i pro výstupní list. Jakmile podepíší všechny tři strany (zaměstnanec,
vedoucí, vydávající), aplikace ve stejném požadavku (ať už přišel
z interní aplikace, nebo z veřejného odkazu):

1. detekuje dokončení (`getExitChecklistCompletionState`),
2. zkusí vygenerovat PDF aktuálního výstupního listu
   (`tryFetchExitChecklistPdfBuffer`) – funguje spolehlivě, když
   dokončení proběhlo z interní aplikace (má potřebnou roli); pokud
   dokončil zaměstnanec přes veřejný odkaz bez interní role, generování
   PDF se přeskočí a e-mail obsahuje jen odkaz,
3. pošle HR e-mail (`sendExitChecklistCompletedEmail`) s PDF v příloze,
   pokud se ho podařilo vygenerovat,
4. pošle samostatný informační e-mail odcházejícímu zaměstnanci
   (`sendExitChecklistCompletedToEmployeeEmail`) na `off.userEmail`,
   pokud je vyplněný – informuje ho, že výstupní list je podepsaný a
   má se dostavit na Personální oddělení pro zápočtový list,
5. zapíše `completedNotificationSentAt` a související metadata do
   hlavičky výstupního listu, aby se e-maily neposlaly opakovaně.

---

### 11.6 Skupina osob k podpisu výstupního listu

Skupina příjemců (`ExitChecklist.header.signatureRecipients`) je
jediný zdroj pravdy pro cílené cronové připomínky (kapitola 2.2, bod
B) i pro to, kdo smí výstupní list podepsat (viz níže). Existují tři
místa, odkud se do ní dá zasahovat:

**"Odeslat všem k podpisu"** (`SendAllDialog`,
`/odchody/[id]/vystupni-list`) – při otevření načte **aktuální uložený
seznam** (ne vždy jen výchozí návrh); teprve pokud pro daný odchod
ještě žádný seznam neexistuje, nabídne k úpravě jen orientační návrh
(zaměstnanec, vedoucí, funkční signatáři jako SNEO, spisová služba,
mzdová účtárna, právní odbor...) – tenhle návrh je ale jen pomůcka,
dokud se z něj opravdu někomu neodešle, do databáze se neukládá. HR
může přidat dalšího příjemce ručně, tlačítkem "Vybrat ze zaměstnanců",
nebo rovnou "v zastoupení" za vybranou zodpovědnou osobu/odbor (dostane
odlišný e-mail). Nově přidaný člověk se automaticky zaškrtne k
odeslání; u každého, komu už dřív bylo odesláno, je vidět "Odesláno
[datum]". Teprve tlačítkem "Odeslat vybraným" appka odešle pozvánku
(`POST .../exit-checklist/invite`) zaškrtnuté skupině a uloží **jen
skutečně odeslané/zrušené příjemce** přes
`POST .../exit-checklist/signature-recipients` s `mode: "replace"`.

**Jednotlivé pozvánky** ("Odeslat k podpisu", "Odeslat k podpisu
v zastoupení") – při odeslání se daný člověk do skupiny **automaticky
přidá** (`mode` bez `replace`, tedy sloučení) – zbytek skupiny
nemažou, jen do ní doplňují. U "v zastoupení" se navíc uloží konkrétní
řádky výstupního listu (`rowKeys`), za které daný člověk podepisuje, a
popisek, za koho podepisuje (`behalfLabel`).

**"Osoby k podpisu"** (`SignatureRecipientsDialog`,
`/odchody/[id]/vystupni-list`, dřív "Příjemci k podpisu") – samostatné
okno jen pro správu už uložené skupiny, mimo tok "odeslat všem znovu".
Zobrazí aktuální seznam (kdo, kdy dostal pozvánku, případně
"v zastoupení za koho") a umožní přidat nového člověka (ručně, tlačítkem
"Vybrat ze zaměstnanců", nebo rovnou "v zastoupení" – v obou případech
rovnou pošle pozvánku a přidá ho do seznamu).

**Odebrání = zrušení, ne smazání.** V obou oknech ("Odeslat všem
k podpisu" i "Osoby k podpisu") odebrání člověka, kterému už bylo
odesláno, nastaví jen `revokedAt` – záznam v poli zůstává, jen se
přesune do části "Zrušení příjemci" a přestane se počítat jako aktivní
(cron ho přeskočí, viz kapitola 2.2 bod B, a nesmí ani podepisovat, viz
níže). Tlačítkem "Vrátit" jde zrušení kdykoli vzít zpět – vymaže se
`revokedAt`, obnoví se právo podepisovat i připomínky, ale **nová
pozvánka se neposílá**. Odebrání kandidáta z výchozího návrhu, kterému
ještě nikdy nic nebylo odesláno, se naopak z pole prostě smaže (nemá co
zrušit).

**Identita v poli je e-mail + role v zastoupení, ne jen e-mail.**
Stejný člověk (stejný e-mail) může být ve skupině ve dvou nezávislých
rolích zároveň – jednou přímo za sebe, jednou (nebo víckrát) v
zastoupení za jinou osobu/odbor (`behalfLabel`). Přidání, odebrání,
vrácení i cílené připomínky rozlišují každou roli zvlášť podle dvojice
e-mail + `behalfLabel`, takže zásah do jedné role neovlivní tu druhou.

**Přístup k podpisu (a ve veřejné verzi i k samotnému zobrazení) je
vázaný na tuto skupinu.** Kdo je v ní aktivně (bez `revokedAt`), smí ve
výstupním listu podepisovat; kdo byl odebraný, přes veřejný odkaz už
výstupní list vůbec neuvidí, jen hlášku, že nemá přístup k podpisu a má
se v případě nejasností obrátit na Personální oddělení (`GET` i `PUT`
na `/api/odchody/public/[token]` to hlídají shodně). Toto se řídí
výhradně příslušností ke skupině, ne rolí nastavenou v administraci
appky. V interní aplikaci naproti tomu smí podepisovat vždy uživatelé
s rolí HR, IT, READONLY nebo ADMIN, bez ohledu na členství ve skupině.

Ať už se skupina upraví kterýmkoli z těchto tří míst, příští běh cronu
vždy reaguje na aktuální uložený stav, ne na historii dřívějších
odeslání.

---

## 12. Jak ověřit nastavení v GitHubu

V repozitáři:

```txt
Settings → Secrets and variables → Actions
```

nebo při použití environments:

```txt
Settings → Environments → dev / production → Environment secrets
```

Zkontrolovat, že existují secrets:

```txt
APP_URL
CRON_SECRET
```

Hodnotu secretu GitHub zpětně neukáže. Uvidět lze pouze název secretu a informaci, že existuje.

Pokud není jisté, jaká hodnota tam je, je potřeba secret přepsat novou hodnotou a stejnou hodnotu nastavit i do ENV aplikace.

---

## 13. Kontrolní checklist pro nové prostředí

Před spuštěním cronů v novém prostředí ověřit:

- [ ] Aplikace běží na známé URL.
- [ ] V aplikaci je nastavený `CRON_SECRET`.
- [ ] V GitHub Actions je nastavený stejný `CRON_SECRET`.
- [ ] V GitHub Actions je nastavené správné `APP_URL`.
- [ ] `APP_URL` ukazuje na běžící instanci aplikace.
- [ ] Cron endpointy (`probation-notifications`, `offboarding-notifications`, `mail-worker`) lze ručně zavolat přes `curl` s Authorization headerem.
- [ ] Je nastavená `DATABASE_URL`.
- [ ] Jsou nasazené databázové migrace (včetně nových hodnot enumů, např. `DEADLINE_REMINDER_SENT`).
- [ ] Je nastavený `RESEND_API_KEY`.
- [ ] Je nastavený `RESEND_EMAIL_FROM`.
- [ ] Odesílací doména/adresa je ověřená v Resendu.
- [ ] Jsou nastavené příjemci, například `HR_EMAILS`.
- [ ] Mail worker umí zpracovat čekající položky v `MailQueue`.
- [ ] DEV a PROD mají ideálně oddělené secrety a URL.

---

## 14. Nejčastější problémy a řešení

### 14.1 Cron vrací 401 nebo 403

Pravděpodobná příčina:

- chybí Authorization header,
- nesedí `CRON_SECRET`,
- GitHub má jiný secret než běžící aplikace.

Ověřit:

```txt
Authorization: Bearer <CRON_SECRET>
```

A porovnat:

- `CRON_SECRET` v ENV aplikace,
- `CRON_SECRET` v GitHub Actions secrets.

---

### 14.2 GitHub Actions běží, ale volá špatnou aplikaci

Pravděpodobná příčina:

- špatně nastavené `APP_URL`,
- DEV workflow volá PROD,
- PROD workflow volá DEV,
- URL neobsahuje správnou doménu.

Ověřit:

```txt
APP_URL
```

Musí ukazovat na konkrétní běžící instanci.

---

### 14.3 Lokálně cron nefunguje

GitHub Secrets se lokálně nepoužívají.

Pro lokální test je potřeba `.env.local`.

Minimální příklad:

```env
CRON_SECRET=local-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

---

### 14.4 Cron vytvoří úlohy, ale e-maily nechodí

Ověřit:

- `RESEND_API_KEY`,
- `RESEND_EMAIL_FROM`,
- ověření domény v Resendu,
- `HR_EMAILS`,
- záznamy v `MailQueue`,
- logy endpointu `/api/cron/mail-worker`,
- jestli mail worker opravdu běží.

---

### 14.5 Mail worker neběží

Ověřit:

- existenci workflow `.github/workflows/mail-worker.yml`,
- jestli workflow není disabled,
- jestli běží schedule nebo `workflow_dispatch`,
- jestli má workflow přístup k `APP_URL` a `CRON_SECRET`,
- jestli curl request nepadá na 401/403/500.

---

### 14.6 Finální vyhodnocení dlouho ukládá

Finální uložení může trvat déle, protože aplikace:

- ukládá data,
- generuje PDF,
- odesílá e-mail na HR,
- zapisuje historii.

Proto má UI zobrazovat loading stav typu „Ukládám a odesílám…“.

---

### 14.7 Rozpracované uložení ukazuje hlášku o odeslaném e-mailu

To je chyba UI callbacku, ne nutně chyba backendu.

Rozpracované uložení má pouze uložit draft. Nemá spouštět callback nebo toast určený pro odeslání e-mailu.

Správné chování:

- `draft` → uložit data, zobrazit hlášku o uložení rozpracované verze,
- `final` → uložit, vygenerovat PDF, odeslat HR, zobrazit success,
- `revision` → uložit změny, vygenerovat nové PDF, odeslat HR, zobrazit success.

---

## 15. Doporučený text pro předání

Krátké shrnutí pro správce nebo vedoucího:

```txt
Crony v aplikaci nejsou spouštěné automaticky samotným Next.js kódem. Musí je volat externí plánovač, aktuálně ideálně GitHub Actions. Pro fungování je potřeba mít CRON_SECRET nastavený jak v běžící aplikaci, tak v GitHub Actions secrets. Hodnoty musí být stejné. GitHub dále potřebuje APP_URL, což je URL běžící instance aplikace.

Cron probation-notifications hlídá vypršení odkazů k vyplnění nástupních dokumentů a posílá upozornění přímo (mimo MailQueue) – automatika k zkušební době je v něm dočasně vypnutá. Cron offboarding-notifications kontroluje plánované odchody (dosud bez potvrzeného skutečného konce) a blížící se konec pracovního poměru u nedokončených výstupních listů – posílá souhrnnou upomínku pro HR (jestli je potřeba poslat pozvánku, nebo jen upozornit, že list není hotový) i cílenou připomínku přímo konkrétnímu příjemci ze skupiny naposledy uložené přes „Odeslat všem k podpisu“, který ještě nepodepsal, přes MailQueue. Samotné odesílání front provádí cron mail-worker, který zpracovává MailQueue a posílá e-maily přes Resend.

Oba kontrolní crony mají v aplikaci běžet jen jednou denně v 8:00 pražského času, proto mají v GitHub Actions nastavené schedule na dvě UTC hodnoty (6 a 7) kvůli letnímu/zimnímu času – endpoint sám pozná, který běh je ten správný.

Pro e-maily musí být v běžícím prostředí nastavený RESEND_API_KEY, RESEND_EMAIL_FROM a příjemci, například HR_EMAILS. Pro DEV a PROD je doporučené mít oddělené APP_URL a CRON_SECRET.

Cron endpointy se neautorizují přes role HR/ADMIN v aplikaci, ale technicky přes Authorization: Bearer <CRON_SECRET>.
```

---

## 16. Co je potřeba mít v repozitáři

Doporučené soubory:

```txt
.github/workflows/probation-cron.yml
.github/workflows/offboarding-cron.yml
.github/workflows/mail-worker.yml
docs/cron-notification-full-version.md
docs/cron-short-summary.md
```

Doporučené dokumentovat:

- endpointy,
- required ENV,
- required GitHub Secrets,
- rozdíl mezi DEV a PROD,
- ruční curl test,
- troubleshooting.

---

## 17. Rychlá odpověď na otázku „co to dělá?“

Cron `probation-notifications` automaticky hlídá vypršení odkazů k vyplnění nástupních dokumentů a posílá upozornění zaměstnanci (3 dny předem), HR (v den vypršení) i HR na dokumenty, které ještě vůbec nebyly odeslány (3 dny před plánovaným nástupem). Automatika k zkušební době je v něm od verze 0.14.0 dočasně vypnutá – bude řešena přes jinou aplikaci.

Cron pro blížící se konec pracovního poměru automaticky hlídá plánované odchody (dosud bez potvrzeného skutečného konce). Dřív než se vůbec odešlou první pozvánky k podpisu zkontroluje, že HR má vyplněného vedoucího odboru a rozhodnutý střet zájmů (od 1 měsíce před koncem, u krátké výpovědní doby hned). Po odeslání pozvánek pak na škále 14/7/5/3/2/1/0 dní předem posílá cílené připomínky konkrétním nepodepsaným příjemcům (s poznámkou podle jejich role) a na stejné dny i souhrnný report pro HR, kdo ještě nepodepsal.

Mail worker následně bere připravené zprávy z e-mailové fronty a fyzicky je odesílá přes Resend.

Finálně vyplněné vyhodnocení zkušební doby se řeší samostatně: při finálním uložení se vygeneruje PDF a odešle se HR.
