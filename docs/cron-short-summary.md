# Crony a e-mailová fronta – stručné shrnutí

Tento dokument shrnuje, co je potřeba vědět pro převzetí, nasazení a kontrolu cronů a e-mailové fronty v aplikaci.

## 1. K čemu crony slouží

Aplikace používá cron endpointy pro automatickou práci se zkušební dobou a e-mailovou frontou.

Crony se nespouští automaticky jen tím, že je kód v GitHubu. Musí je volat externí plánovač, například GitHub Actions, hostingový scheduler, serverový cron nebo ruční HTTP request.

Základní tok:

1. Cron `probation-notifications` projde nástupy a konce zkušebních dob.
2. Podle pravidel vytvoří e-mailové úlohy v `MailQueue`.
3. Cron `mail-worker` zpracuje čekající položky z `MailQueue`.
4. E-maily se odešlou přes Resend.
5. Výsledek se zapíše do databáze / historie.

## 2. Hlavní endpointy

### Kontrola zkušebních dob

```txt
GET /api/cron/probation-notifications
```

Slouží ke kontrole nástupů a konců zkušebních dob. Typicky připravuje e-mailové úlohy pro zaslání formuláře vedoucímu, připomínky, upozornění HR při chybějícím vedoucím nebo informaci HR, pokud vyhodnocení není dokončené.

Důležité: tento endpoint běžně e-maily přímo neposílá, pouze vytváří úlohy do `MailQueue`.

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

Každé volání musí obsahovat header:

```txt
Authorization: Bearer <CRON_SECRET>
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
EMAIL_FROM=...
HR_EMAILS=hr1@praha6.cz,hr2@praha6.cz
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

Crony pracují s databází, hlavně s nástupy, zkušební dobou a tabulkou `MailQueue`. Prostředí musí mít správnou `DATABASE_URL` a nasazené migrace.

### Resend / e-mailová služba

Pro odesílání e-mailů musí být nastavený `RESEND_API_KEY`, `EMAIL_FROM`, ověřená doména nebo odesílací adresa v Resendu a příjemci jako `HR_EMAILS`.

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

Kontrola zkušebních dob jednou denně ráno:

```yml
name: Probation Check

on:
  schedule:
    - cron: "7 6 * * *"
  workflow_dispatch:

jobs:
  probation-check:
    runs-on: ubuntu-latest
    steps:
      - name: Call probation notifications cron
        run: |
          curl -fsS "$APP_URL/api/cron/probation-notifications" \
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

## 10. Nejčastější problémy

### Cron vrací 401/403

Nesedí nebo chybí `CRON_SECRET`. Zkontrolovat ENV aplikace, GitHub secrets a header `Authorization: Bearer <CRON_SECRET>`.

### GitHub Actions běží, ale volá špatnou aplikaci

Zkontrolovat `APP_URL`. Musí ukazovat na správnou DEV nebo PROD instanci.

### Lokálně cron nefunguje

GitHub secrets se lokálně nepoužívají. Je potřeba mít vlastní `.env.local`.

### E-maily nejsou doručené

Zkontrolovat `RESEND_API_KEY`, `EMAIL_FROM`, ověřenou doménu/adresu v Resendu, `HR_EMAILS`, logy aplikace a stav položek v `MailQueue`.

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
- `probation-notifications` vytváří úlohy do `MailQueue`,
- `mail-worker` dokáže úlohy z `MailQueue` odeslat.
