# Crony a e-mailová fronta – stručné shrnutí

Tento dokument shrnuje, co je potřeba vědět pro převzetí, nasazení a kontrolu cronů a e-mailové fronty v aplikaci.

## 1. K čemu crony slouží

Aplikace používá cron endpointy pro automatickou práci s vypršením odkazů k vyplnění nástupních dokumentů a žádosti o pracovnělékařskou prohlídku, s blížícím se koncem pracovního poměru a s e-mailovou frontou. Vyhodnocení zkušební doby je od verze 0.15.0 úplně vypnuté (agendu přebírá Systemizace) – automatika k němu byla odpojená už od verze 0.14.0.

Crony se nespouští automaticky jen tím, že je kód v GitHubu. Musí je volat externí plánovač, například GitHub Actions, hostingový scheduler, serverový cron nebo ruční HTTP request.

Základní tok:

1. Cron `probation-notifications` projde nástupní dokumenty a hlídá jak vypršení odkazů k jejich vyplnění, tak (7 dní po založení záznamu, pak opakovaně po 3 dnech) dokumenty a žádost o pracovnělékařskou prohlídku, které ještě vůbec nebyly odeslány (pokud u jednoho nástupu platí obě upozornění zároveň, spojí se do jednoho e-mailu; vyhodnocení zkušební doby je úplně vypnuté). Dál (taky opakovaně po 3 dnech) hlídá, zda po plánovaném dni nástupu někdo potvrdil skutečný nástup, a zda jsou nástupní dokumenty i žádost o lékařskou prohlídku hotové na 100 % a HR to ještě neoznačila jako hotové/zamčené. Zároveň hlídá u nástupů chybějícího vedoucího odboru / informuje vedoucího o novém nástupu (viz níže).
2. Cron `offboarding-notifications` projde **plánované** odchody (dosud bez potvrzeného skutečného konce). Dřív než se poprvé odešlou pozvánky k podpisu, zkontroluje, že HR má vyplněného vedoucího odboru a rozhodnutý střet zájmů. Po odeslání pozvánek posílá cílené připomínky konkrétním lidem ze skupiny naposledy uložené v okně „Osoby k podpisu", kteří ještě nepodepsali, a na stejné dny i souhrnný report pro HR. Od plánovaného konce navíc opakovaně po 3 dnech upozorňuje HR, pokud nikdo v appce nepotvrdil, že k odchodu skutečně došlo (stejná situace se zároveň ukazuje jako banner v přehledu Odchodů), a stejně opakovaně po 3 dnech připomíná, pokud je výstupní list 100 % hotový, ale ještě není uzamčený. Zároveň hlídá u odchodů chybějícího vedoucího odboru / informuje vedoucího o novém odchodu (viz níže).
3. Podle pravidel oba vytvoří e-mailové úlohy v `MailQueue`.
4. Cron `mail-worker` zpracuje čekající položky z `MailQueue`.
5. E-maily se odešlou přes Resend.
6. Výsledek se zapíše do databáze / historie.

Oba kontrolní crony (`probation-notifications`, `offboarding-notifications`) běží jen jednou denně v 8:00 pražského času – viz kapitola 8.

## 2. Hlavní endpointy

### Kontrola vypršení odkazů k vyplnění nástupních dokumentů

```txt
GET /api/cron/probation-notifications
```

Název je historický – dřív kontroloval zkušební doby. Od verze 0.14.0
je tahle automatika (`@/lib/probation-cron-jobs`) odebraná, kód zůstal
beze změny jen se nevolá. Od verze 0.15.0 je navíc celé vyhodnocení
zkušební doby vypnuté i mimo cron (agendu přebírá Systemizace) –
tlačítka, formulář i veřejný odkaz jsou needitovatelné. E-mailové
šablony a zbytek logiky k vyhodnocení zkušební doby v kódu zůstávají,
ale nejsou odnikud dosažitelné, dokud je přepínač vypnutý.

Endpoint teď hlídá vypršení odkazů k vyplnění nástupních dokumentů
(čestné prohlášení, osobní dotazník, mzdový dotazník) –
`@/lib/employment-document-cron-jobs`. 3 dny před vypršením pošle
upozornění zaměstnanci, v den vypršení (pokud pořád není vyplněno)
upozorní HR – tyto dvě připomínky počítají jen u dokumentů, které už
byly opravdu odeslané. Navíc **7 dní po založení záznamu nástupu**
(ne podle plánovaného data nástupu – je to schválně opačně než
u výstupního listu, kde se čeká až do posledního měsíce před koncem)
upozorní HR i na dokumenty, které ještě vůbec nebyly zaměstnanci
odeslané, a stejně tak na nástupy, kde je vyplněný osobní dotazník,
ale ještě nebyla odeslána žádost o pracovnělékařskou prohlídku; pokud
se do 3 dnů nic nevyřeší, připomínka se **opakuje každé 3 dny**. Pokud
u jednoho nástupu platí obě upozornění zároveň (dokumenty i žádost),
pošle se jeden společný e-mail místo dvou.

Dál hlídá dvě nové situace, obě opakovaně po 3 dnech, dokud se
nevyřeší, a případně víc záznamů dohromady v jednom e-mailu:

- **jakmile nastal plánovaný den nástupu a nikdo v appce nepotvrdil,
  že člověk skutečně nastoupil** (`actualStart` prázdné), upozorní HR,
  ať to zkontroluje,
- **jakmile jsou u nástupu nástupní dokumenty i žádost o
  pracovnělékařskou prohlídku kompletně hotové na 100 %**
  (`documentsReadinessStatus` automaticky přepnuté na `READY`), ale HR
  to ještě neoznačila jako hotové a nezamkla (viz kapitola 2.1 plné
  verze a sekce o uzamčení níže), připomene jí to – bez ohledu na to,
  jestli nástup mezitím přešel na skutečný.

Důležité: na rozdíl od dřívějšího chování posílá e-maily přímo, ne
přes `MailQueue`.

Dále endpoint hlídá u nástupů **založených ode dne prvního nasazení této
automatiky** (přesná hranice se vypočítá jako začátek měsíce prvního
skutečného běhu a uloží se do `SystemSettings`, aby se neposouvala při
dalších bězích a aby se netýkala starších, dříve založených nástupů):
pokud u nástupu chybí vyplněný vedoucí odboru, posílá o tom denně
opakovanou upomínku HR (`HR_EMAILS`), dokud vedoucí není doplněn; pokud
vedoucí už vyplněný je, pošle mu (jednorázově) informační e-mail, že byl
zaevidován nový předpokládaný nástup, u kterého je uveden jako vedoucí
odboru, s odkazem na záznam v appce a instrukcí k přihlášení (firemní
Google účet @praha6.cz/@kitt6.cz, čtecí READONLY přístup; pokud se
nedostane, kontakt na administrátora appky nebo na Personální oddělení).
Obě upozornění jedou přes `MailQueue` (typy `NOTICE_WARNING` a
`NEW_RECORD_MANAGER_NOTICE`).

### Stav připravenosti nástupních dokumentů (`documentsReadinessStatus`)

Mimo cron, ale přímo související s upomínkou výše: každý nástup má
pole `documentsReadinessStatus` (enum `IN_PROGRESS` / `READY` /
`LOCKED`), které appka sama přepočítává (`recomputeOnboardingReadiness`
v `@/lib/onboarding-readiness`) po každé události, co může stav
ovlivnit (vyplnění dokumentu, odeslání žádosti o lékařskou prohlídku,
reset dokumentu, odemčení). Na `READY` se přepne, až jsou hotové
všechny 3 nástupní dokumenty i odeslaná žádost o pracovnělékařskou
prohlídku – to je přesně jediný a jednoznačný signál "připraveno k
přečtení", myšlený jako podklad pro budoucí napojení Systemizace nebo
jiného API. Z `READY` do `LOCKED` přepíná výhradně HR/ADMIN ručně
tlačítkem v okně Dokumenty (`POST /api/nastupy/[id]/documents-lock`),
zapíše se `documentsLockedAt`/`documentsLockedBy`; dokud je záznam
`LOCKED`, blokuje se další úprava dokumentů i žádosti (410/423 chyba),
dokud ho HR/ADMIN znovu neodemkne (`/documents-unlock`) – po odemčení
se stav přepočítá znovu (pokud mezitím něco přestalo být kompletní,
vrátí se na `IN_PROGRESS`, ne na `READY`).

### Kontrola blížícího se konce pracovního poměru

```txt
GET /api/cron/offboarding-notifications
```

Slouží ke kontrole **plánovaných** odchodů (dosud bez potvrzeného skutečného konce), kterým se blíží konec pracovního poměru a jejich výstupní list ještě není kompletně podepsaný. Jakmile se odchod potvrdí jako skutečný (vyplní se `actualEnd`), cron ho od té chvíle úplně přeskočí. Řeší čtyři typy připomínek (1. a 2. vždy jen jednou za dané okno, 3. a 4. opakovaně po 3 dnech, dokud se nevyřeší):

1. **Kontrola před odesláním pozvánek** (`HR_EMAILS`) – dokud HR pro daný odchod ještě nikdy neodeslala žádnou pozvánku k podpisu, cron (od 1 měsíce před koncem, u krátké výpovědní doby hned) kontroluje, že je vyplněný vedoucí odboru a rozhodnutý střet zájmů (rozhoduje se v okně „Osoby k podpisu"). Pokud něco chybí, pošle HR e-mail s výčtem, co doplnit.
2. **Cílená připomínka konkrétním lidem + report pro HR** – v okamžicích **14, 7, 5, 3, 2, 1 a 0 dní** před koncem. Posílá se přímo každému příjemci ze skupiny naposledy uložené (`ExitChecklist.header.signatureRecipients`), kdo ještě nepodepsal, na stejný odkaz, jaký dostal v pozvánce, s poznámkou podle jeho role (zaměstnanec / vedoucí / odpovědná osoba za sekci B). Skupina se pro každý odchod může lišit (zaměstnanec, vedoucí i libovolní další signatáři, včetně lidí přidaných "v zastoupení") a cron ji vždy počítá podle posledního uloženého stavu; pokud má někdo přiřazeno víc řádků k podpisu, počítá se jako nepodepsaný (a připomínka chodí dál), dokud nejsou podepsané úplně všechny. Do skupiny se přidává automaticky každou jednotlivou pozvánkou a přes okno „Osoby k podpisu" (dřív „Příjemci k podpisu"). Zrušený (odebraný) člověk se nemaže, jen se vynechá z připomínek, dokud není tlačítkem „Vrátit" vrácen zpět – zrušení mu zároveň odebere i právo výstupní list podepsat. Stejný e-mail může mít ve skupině dvě nezávislé role (přímo za sebe a k tomu v zastoupení za jinou osobu) – cron je počítá odděleně. Pokud na daný den zbyl alespoň jeden nepodepsaný, zařadí se na stejný den i jeden souhrnný report pro HR se jmény a e-maily těch, co ještě nepodepsali. Cron nikoho nezve poprvé sám od sebe.
3. **Potvrzení, že plánovaný odchod skutečně proběhl** – od dne, kdy nastal plánovaný konec, pokud nikdo v appce nepotvrdil, že k odchodu skutečně došlo, pošle o tom e-mail HR; dokud se nepotvrdí nebo odchod nezruší, připomínka se opakuje každé 3 dny (stejný princip jako obdobná "nastoupil opravdu?" připomínka u nástupů, jen opačným směrem).
4. **Upomínka na odemčený, ale hotový výstupní list** – dokud je checklist 100 % kompletní a podepsaný, ale v appce ještě není uzamčený, posílá o tom HR souhrnný e-mail, opakovaně každé 3 dny.

Endpoint přímo neposílá e-maily, pouze vytváří úlohy typu `NOTICE_WARNING` do `MailQueue` (na rozdíl od `probation-notifications`, který od verze 0.14.0 posílá připomínky k dokumentům přímo).

Stejně jako u `probation-notifications` navíc hlídá u **odchodů založených
ode dne prvního nasazení této automatiky** chybějícího vedoucího odboru
(denní upomínka HR, dokud není doplněn) a jednorázově informuje vedoucího
o novém předpokládaném odchodu, u kterého je uveden – viz popis u
`probation-notifications` výše, chování je u obou typů záznamů stejné.

### Mail worker

```txt
GET /api/cron/mail-worker
```

Slouží ke zpracování e-mailové fronty. Najde čekající položky v `MailQueue`, sestaví příslušný e-mail, odešle ho přes Resend a zapíše stav odeslání nebo chybu.

### Obecný cron endpoint

```txt
GET /api/cron
```

Může sloužit pro kompatibilitu nebo starší napojení. Primárně je vhodné používat konkrétní endpointy `probation-notifications` a `mail-worker`.

## 3. Autorizace cronů

Cron endpointy jsou chráněné přes `CRON_SECRET`.

Každé volání musí obsahovat jeden z těchto headerů:

```txt
Authorization: Bearer <CRON_SECRET>
```

nebo alternativně:

```txt
x-cron-secret: <CRON_SECRET>
```

Hodnota `CRON_SECRET` musí být stejná:

- v ENV běžící aplikace,
- v GitHub Actions secrets nebo v jiném systému, který cron volá.

Pokud hodnota nesedí nebo header chybí, endpoint vrátí chybu 401/403.

## 4. ENV proměnné v aplikaci

V prostředí, kde aplikace skutečně běží, musí být nastavené minimálně:

```env
CRON_SECRET=dlouhy-nahodny-token
NEXT_PUBLIC_APP_URL=https://url-aplikace
AUTH_URL=https://url-aplikace
NEXTAUTH_URL=https://url-aplikace
```

Pro databázi a autentizaci:

```env
DATABASE_URL=...
AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Pro e-maily přes Resend:

```env
RESEND_API_KEY=...
RESEND_EMAIL_FROM=...
HR_EMAILS=hr1@praha6.cz,hr2@praha6.cz
```

Volitelně lze nastavit i velikost dávky pro mail worker (výchozí 20, max 100):

```env
MAIL_WORKER_BATCH_SIZE=20
```

`AUTH_SECRET` má být samostatný náhodný secret, ne Google Client ID. Lze ho vygenerovat například:

```bash
openssl rand -base64 32
```

## 5. GitHub Actions secrets

Pokud crony spouští GitHub Actions, musí být v GitHubu nastavené secrets:

```env
APP_URL=https://url-bezici-aplikace
CRON_SECRET=stejna-hodnota-jako-v-env-aplikace
```

Důležité:

- `APP_URL` musí ukazovat na skutečně běžící instanci aplikace.
- `CRON_SECRET` v GitHubu musí být stejný jako `CRON_SECRET` v ENV aplikace.
- GitHub secrets se nepřenášejí automaticky do aplikace ani do lokálního prostředí.

Pro DEV a PROD je doporučené mít rozdílné hodnoty:

```env
# DEV
APP_URL=https://dev-url-aplikace
CRON_SECRET=dev-secret

# PROD
APP_URL=https://produkce-url-aplikace
CRON_SECRET=prod-secret
```

Možnosti nastavení:

- použít GitHub Environments `dev` a `production`, kde mohou mít secrets stejné názvy `APP_URL` a `CRON_SECRET`, ale jiné hodnoty,
- nebo použít samostatné secrets typu `DEV_APP_URL`, `DEV_CRON_SECRET`, `PROD_APP_URL`, `PROD_CRON_SECRET` a tomu přizpůsobit workflow.

## 6. Potřebná technická práva

Pro správné fungování cronů nestačí samotný kód v GitHubu. Je potřeba mít technické přístupy k těmto částem:

### ENV aplikace

Někdo musí mít možnost nastavit ENV proměnné v prostředí, kde aplikace běží, hlavně `CRON_SECRET`, URL aplikace, databázi a e-mailové proměnné.

### GitHub Actions / Secrets

Někdo musí mít právo nastavit nebo zkontrolovat GitHub secrets, případně GitHub Environments. V GitHubu je možné zpětně vidět názvy secrets, ale ne jejich hodnoty. Pokud není jisté, jaká hodnota je uložená, je potřeba secret přepsat novou hodnotou.

### Běžící aplikace

GitHub Actions nebo jiný scheduler musí být schopný zavolat veřejnou URL aplikace. Endpointy jsou veřejně dostupné přes HTTP, ale chráněné přes `Authorization: Bearer <CRON_SECRET>`.

### Databáze

Crony pracují s databází, hlavně s nástupními dokumenty (`EmploymentDocument`), plánovanými odchody a tabulkou `MailQueue`. Prostředí musí mít správnou `DATABASE_URL` a nasazené migrace.

### Resend / e-mailová služba

Pro odesílání e-mailů musí být nastavený `RESEND_API_KEY`, `RESEND_EMAIL_FROM`, ověřená doména nebo odesílací adresa v Resendu a příjemci jako `HR_EMAILS`.

### Aplikační role

Cron endpointy se neřídí běžnými uživatelskými rolemi jako HR, ADMIN nebo IT. Cron se autorizuje technicky přes `CRON_SECRET`.

Běžné role v aplikaci zůstávají pro práci s formuláři:

- ADMIN / HR / IT mohou spravovat vyhodnocení,
- READONLY může číst,
- veřejné formuláře fungují přes token a přihlášení oprávněného uživatele.

## 7. Příklad ručního testu

Kontrola zkušebních dob:

```bash
curl -fsS "https://url-aplikace/api/cron/probation-notifications" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Kontrola blížícího se konce pracovního poměru:

```bash
curl -fsS "https://url-aplikace/api/cron/offboarding-notifications" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Mail worker:

```bash
curl -fsS "https://url-aplikace/api/cron/mail-worker" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Lokálně například:

```env
CRON_SECRET=local-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
```

```bash
curl -fsS "http://localhost:3000/api/cron/probation-notifications" \
  -H "Authorization: Bearer local-secret"
```

## 8. Příklad GitHub Actions workflow

Skutečné soubory v repozitáři: `.github/workflows/probation-cron.yml` a
`.github/workflows/offboarding-cron.yml`. Oba mají stejnou strukturu a
volají svůj endpoint přes `POST` s `Authorization: Bearer $CRON_SECRET`.

Obě kontroly (zkušební doba i konec pracovního poměru) mají mít v
aplikaci nastavené jen jedno denní okno – 8:00 pražského času. Protože
GitHub Actions cron běží v UTC a nezná časové pásmo, spouští se
workflow ve **dvou** UTC časech (6 a 7), které odpovídají 8:00 v létě
(SELČ/CEST) i v zimě (SEČ/CET). Sám endpoint pak podle skutečného
pražského času pozná, který z těch dvou běhů má proběhnout, a ten
druhý jen no-opne (vrátí `status: "skipped"`).

Kontrola zkušebních dob:

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

Kontrola blížícího se konce pracovního poměru – stejný princip, jiný endpoint:

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

Mail worker vícekrát denně:

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

Časy v GitHub Actions cronu jsou v UTC.

## 9. Důležité upozornění k finálnímu vyhodnocení zkušební doby

Finální odeslání vyplněného formuláře s PDF na HR se neřeší přes běžnou mail queue.

Při finálním uložení vyhodnocení aplikace:

- uloží vyhodnocení,
- vygeneruje PDF,
- odešle PDF na HR,
- zapíše informaci do historie vyhodnocení.

Rozpracované uložení formuláře pouze uloží data. Nemá spouštět odeslání e-mailu ani zobrazovat hlášku, že e-mail byl odeslán.

Pokud vedoucí, který formulář vyplňuje, není sám tajemník úřadu, navazuje druhá fáze – vyjádření tajemníka. Kdo dostane co a kdy (vše mimo `MailQueue`, odesláno přímo v okamžiku dané akce):

1. Vedoucí odešle finální vyhodnocení → HR dostane PDF e-mailem (+ info, že šlo i tajemníkovi), tajemník dostane PDF a odkaz k vyjádření.
2. Tajemník odešle své vyjádření → HR dostane nový PDF e-mail s **oběma** stanovisky (vedoucí ANO/NE + tajemník souhlasí/nesouhlasí) a **vedoucí dostane samostatný e-mail**, že se tajemník vyjádřil.
3. HR odemkne a někdo upraví (revize) → HR dostane nový PDF e-mail; tajemníkovi ani vedoucímu se nic neposílá.

Podrobný přehled „kdo/co/kdy“ je v `docs/cron-notification-full-version.md`, kapitola 11.4.

Stejný princip (mimo mail queue, přímo v okamžiku dokončení) platí i pro **výstupní list**: jakmile podepíší všechny strany (zaměstnanec, vedoucí, vydávající), aplikace ve stejném požadavku:

- pošle HR e-mail s PDF podepsaného výstupního listu v příloze (příloha se negeneruje, jen když dokončení proběhlo z veřejného odkazu bez dostatečného oprávnění – pak e-mail obsahuje aspoň odkaz) a výzvou, ať si se zaměstnancem domluví předání zápočtového listu a poté výstupní list označí jako hotový a zamkne pro další úpravy,
- pošle samostatný informační e-mail odcházejícímu zaměstnanci, že má výstupní list podepsaný a má se dostavit na Personální oddělení pro zápočtový list,
- zapíše obojí do historie výstupního listu.

## 10. Nejčastější problémy

### Cron vrací 401/403

Nesedí nebo chybí `CRON_SECRET`. Zkontrolovat ENV aplikace, GitHub secrets a header `Authorization: Bearer <CRON_SECRET>`.

### GitHub Actions běží, ale volá špatnou aplikaci

Zkontrolovat `APP_URL`. Musí ukazovat na správnou DEV nebo PROD instanci.

### Lokálně cron nefunguje

GitHub secrets se lokálně nepoužívají. Je potřeba mít vlastní `.env.local`.

### E-maily nejsou doručené

Zkontrolovat `RESEND_API_KEY`, `RESEND_EMAIL_FROM`, ověřenou doménu/adresu v Resendu, `HR_EMAILS`, logy aplikace a stav položek v `MailQueue`.

### Cron vytvoří úlohy, ale nic se neodešle

Pravděpodobně neběží `mail-worker`, nebo má problém s Resendem / ENV proměnnými.

## 11. Checklist před nasazením

Před spuštěním cronů v novém prostředí ověřit:

- aplikace běží na správné URL,
- v aplikaci je nastavený `CRON_SECRET`,
- v GitHub Actions nebo scheduleru je stejný `CRON_SECRET`,
- `APP_URL` ukazuje na správnou instanci,
- jsou nastavené proměnné pro Resend,
- jsou nastavení příjemci HR e-mailů,
- databáze má správnou `DATABASE_URL`,
- migrace jsou nasazené,
- endpointy lze ručně zavolat přes curl,
- `probation-notifications` posílá připomínky k dokumentům i k žádosti o lékařskou prohlídku (vypršení i nezaslané) přímo (ne přes `MailQueue`),
- `offboarding-notifications` vytváří úlohy do `MailQueue`,
- `mail-worker` dokáže úlohy z `MailQueue` odeslat.
