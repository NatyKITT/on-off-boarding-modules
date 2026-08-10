# Crony, e-mailová fronta a technické přístupy

Tento dokument popisuje, k čemu v aplikaci slouží cron endpointy, jak funguje e-mailová fronta, jaké proměnné prostředí je potřeba nastavit, jaká technická oprávnění jsou potřeba a jak ověřit, že je vše správně zapojené.

Dokument je určený pro převzetí, nasazení nebo kontrolu aplikace v jiném prostředí, aby bylo jasné, co je potřeba nastavit mimo samotný kód v GitHubu.

---

## 1. Shrnutí

Aplikace používá cron endpointy pro automatické zpracování agendy zkušební doby, blížícího se konce pracovního poměru a pro odesílání e-mailů z fronty.

Crony se nespouští samy od sebe jen tím, že existuje kód v repozitáři. Musí je volat externí plánovač, například:

- GitHub Actions,
- hostingový scheduler,
- serverový cron,
- ruční HTTP request při testování.

Cron endpointy jsou chráněné přes `CRON_SECRET`. To znamená, že volající systém musí znát stejný secret, jaký má nastavený běžící aplikace ve svém prostředí.

Zjednodušený tok:

1. Cron `probation-notifications` projde nástupy a zkušební doby.
2. Cron `offboarding-notifications` projde skutečné odchody a blížící se konec pracovního poměru u nedokončených výstupních listů.
3. Podle pravidel oba vytvoří e-mailové úlohy v tabulce `MailQueue`.
4. Cron `mail-worker` zpracuje čekající položky z `MailQueue`.
5. Mail worker odešle e-maily přes Resend.
6. Stav odeslání nebo chyba se zapíše do databáze / historie.

Oba kontrolní crony běží jen jednou denně, v 8:00 pražského času – viz kapitola 8.1 a 8.2 k tomu, proč mají v GitHub Actions dvě UTC schedule hodnoty.

---

## 2. Hlavní cron endpointy

### 2.1 Kontrola zkušebních dob

```txt
GET /api/cron/probation-notifications
```

Tento endpoint kontroluje nástupy a konce zkušebních dob.

Typicky zajišťuje:

- dohledání zaměstnanců, kterým se blíží konec zkušební doby,
- vytvoření e-mailové úlohy pro zaslání formuláře vedoucímu,
- vytvoření připomínek,
- vytvoření informace pro HR, pokud chybí vedoucí,
- vytvoření informace pro HR, pokud vyhodnocení není dokončeno.

Důležité: tento endpoint běžně e-maily přímo neposílá. Pouze připravuje úlohy do e-mailové fronty.

---

### 2.2 Kontrola blížícího se konce pracovního poměru

```txt
GET /api/cron/offboarding-notifications
```

Tento endpoint kontroluje **skutečné** odchody (`actualEnd`, ne
`plannedEnd`) a jejich výstupní list.

Řeší dva samostatné typy připomínek, oba v okamžicích 30, 14, 7, 3, 2
a 1 den před koncem, vždy nejvýš jednou za dané okno a daný odchod:

**A) Souhrnná připomínka pro HR** (typ úlohy `NOTICE_WARNING`,
funkce `queueExitChecklistReminders`):

- dohledá skutečné odchody, kterým se blíží konec pracovního poměru,
- u každého ověří, jestli je výstupní list (exit checklist) už
  kompletně podepsaný – pokud ano, upomínka se nevytváří,
- zjistí, jestli už byla k tomuto odchodu vůbec odeslána pozvánka
  k podpisu (kontrola v `EmailHistory`), a podle toho zvolí text:
  - pozvánka ještě neodešla → HR se vyzve, ať ji odešle
    ("Nutno odeslat pozvánku k podpisu výstupního listu…"),
  - pozvánka už odešla, ale list není hotový → HR se jen informuje,
    že list stále čeká na podpis,
- příjemci jsou `HR_EMAILS`,
- zápis události `DEADLINE_REMINDER_SENT` do historie výstupního
  listu.

**B) Cílená připomínka konkrétním lidem** (typ úlohy
`EXIT_SIGNATURE_INVITE`, funkce `queueExitChecklistSignatureReminders`):

- pro každý nedokončený odchod zvlášť zkontroluje zaměstnance a
  vedoucího – komu z nich ještě chybí podpis,
- připomínku pošle **jen** tomu, komu HR pozvánku k podpisu už dříve
  skutečně odeslala (opět kontrola v `EmailHistory`) – cron tedy
  nikoho nezve poprvé sám od sebe, jen připomíná už pozvaným,
- e-mail vede na stejný veřejný odkaz (`/odchody-public/[token]`),
  jaký dostali v původní pozvánce,
- zápis události `SIGNATURE_INVITE_SENT` do historie výstupního
  listu, s metadaty o roli (zaměstnanec/vedoucí) a počtu dní.

Endpoint stejně jako `probation-notifications` e-maily přímo
neposílá, pouze vytváří úlohy do `MailQueue` (`NOTICE_WARNING` a
`EXIT_SIGNATURE_INVITE`).

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

Každé volání cron endpointu musí obsahovat HTTP header:

```txt
Authorization: Bearer <CRON_SECRET>
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

Cron `probation-notifications` čte nástupy, zkušební dobu a stav vyhodnocení.

Cron `offboarding-notifications` čte skutečné odchody, výstupní listy (exit checklist), historii e-mailů (`EmailHistory` – kvůli ověření, komu už HR pozvánku k podpisu odeslala) a zapisuje do historie výstupního listu.

Cron `mail-worker` čte a aktualizuje `MailQueue`.

### 4.5 Přístup k e-mailové službě Resend

Pro odesílání e-mailů je potřeba:

- platný `RESEND_API_KEY`,
- správně nastavený `EMAIL_FROM`,
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
EMAIL_FROM=...
HR_EMAILS=hr1@praha6.cz,hr2@praha6.cz
```

Poznámky:

- `RESEND_API_KEY` je API klíč pro Resend.
- `EMAIL_FROM` musí být adresa/doména povolená v Resendu.
- `HR_EMAILS` je seznam HR příjemců oddělený čárkou.

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
- [ ] Je nastavený `EMAIL_FROM`.
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
- `EMAIL_FROM`,
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

Cron probation-notifications pouze kontroluje zkušební doby a vytváří e-mailové úlohy do MailQueue. Cron offboarding-notifications stejným způsobem kontroluje skutečné odchody a blížící se konec pracovního poměru u nedokončených výstupních listů – posílá souhrnnou upomínku pro HR (jestli je potřeba poslat pozvánku, nebo jen upozornit, že list není hotový) i cílenou připomínku přímo konkrétnímu zaměstnanci nebo vedoucímu, který ještě nepodepsal, ale jen tomu, komu HR pozvánku už dříve skutečně odeslala. Samotné odesílání obou provádí cron mail-worker, který zpracovává MailQueue a posílá e-maily přes Resend.

Oba kontrolní crony mají v aplikaci běžet jen jednou denně v 8:00 pražského času, proto mají v GitHub Actions nastavené schedule na dvě UTC hodnoty (6 a 7) kvůli letnímu/zimnímu času – endpoint sám pozná, který běh je ten správný.

Pro e-maily musí být v běžícím prostředí nastavený RESEND_API_KEY, EMAIL_FROM a příjemci, například HR_EMAILS. Pro DEV a PROD je doporučené mít oddělené APP_URL a CRON_SECRET.

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

Cron pro zkušební dobu automaticky hlídá blížící se konec zkušební doby u nástupů a připravuje e-mailové notifikace pro vedoucí nebo HR.

Cron pro blížící se konec pracovního poměru automaticky hlídá skutečné odchody s nedokončeným výstupním listem a připravuje upomínky pro HR (30/14/7/3 dny předem).

Mail worker následně bere připravené zprávy z e-mailové fronty a fyzicky je odesílá přes Resend.

Finálně vyplněné hodnocení zkušební doby se řeší samostatně: při finálním uložení se vygeneruje PDF a odešle se HR.
