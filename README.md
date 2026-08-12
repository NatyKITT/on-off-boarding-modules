# Modul pro nástupy a odchody zaměstnanců (Praha6 a KITT6)

Interní aplikace pro správu onboarding a offboarding procesů ve veřejné správě pro MÚ pro Prahu 6 a příspěvkovou organizaci KITT6. Umožňuje efektivní spolupráci mezi HR, IT a vedením při zajištění nástupu nebo odchodu zaměstnanců.

## 🔧 Technologie

- [Next.js 14](https://nextjs.org/)
- TypeScript + Tailwind CSS + shadcn/ui
- Autentizace přes NextAuth (Google OAuth)
- Role-based přístup: `USER`, `READONLY`, `HR`, `IT`, `ADMIN`
- Databáze: MySQL (Prisma ORM)
- E-maily: Resend + React Email
- Validace vstupů přes Zod
- Smooth scrolling (Lenis), přepínání motivů (light/dark)

## ✅ Funkce

- Správa nástupů a odchodů (oddělené podle role)
- Zaměstnanecké změny s informační vazbou na nástup/odchod podle osobního čísla
- Výstupní list (exit checklist) s podpisy, předáním agendy a hlídáním termínů
- Vyhodnocení zkušební doby včetně vyjádření tajemníka
- Přehled dokumentů (interní i veřejné odkazy pro zaměstnance)
- Statistiky a měsíční reporty
- Auditní historie u všech modulů (nástupy, odchody, změny, dokumenty, výstupní list, reporty, administrace) včetně smazaných záznamů s možností obnovy
- Uživatelé a jejich oprávnění (role `USER`, `READONLY`, `HR`, `IT`, `ADMIN`, včetně nastavení v administraci)
- Záznamy s přehledem podle měsíců
- Zobrazení detailu nástupu/odchodu s checklistem
- E-mailová oznámení a připomínky přes frontu (`MailQueue`) – viz sekce Crony níže

## ⏰ Crony (automatické notifikace a e-mailová fronta)

Aplikace používá tři cron endpointy pro automatickou práci se zkušební dobou, blížícím se koncem pracovního poměru a e-mailovou frontou. Crony se nespouští samy – musí je pravidelně volat externí plánovač (v tomto repozitáři GitHub Actions, viz `.github/workflows/`).

- `GET /api/cron/probation-notifications` – kontrola nástupů a konců zkušebních dob.
- `GET /api/cron/offboarding-notifications` – kontrola plánovaných odchodů (dosud bez potvrzeného skutečného konce) a nedokončených výstupních listů.
- `GET /api/cron/mail-worker` – zpracování čekajících položek v `MailQueue` a odeslání e-mailů přes Resend.

Oba kontrolní crony (`probation-notifications`, `offboarding-notifications`) mají běžet jen jednou denně v 8:00 pražského času – endpoint si to sám ohlídá podle `Europe/Prague` času bez ohledu na to, v kolik UTC hodin ho plánovač skutečně spustí.

Všechny cron endpointy vyžadují autorizaci přes `CRON_SECRET` (hlavička `x-cron-secret` nebo `Authorization: Bearer <secret>`), stejná hodnota musí být nastavená v běžící aplikaci i u volajícího plánovače.

Podrobný popis (co přesně každý cron dělá, jaké e-maily posílá a v jakých intervalech) je v [`docs/cron-notification-full-version.md`](docs/cron-notification-full-version.md), stručné shrnutí v [`docs/cron-short-summary.md`](docs/cron-short-summary.md).

## 📦 Skripty

```bash
pnpm install               # Instalace všech balíčků a dependencies
pnpm prisma generate
pnpm prisma migrate deploy
pnpm run dev               # Spuštění vývoje
pnpm run build             # Produkční build
pnpm db:push               # Deploy schématu do DB
pnpm prisma migrate dev    # Deploy schématu do DB
pnpm db:studio             # Admin rozhraní pro DB
pnpm lint:fix              # Oprava linter chyb
pnpm prettier:format       # Formátování kódu

# Ruční spuštění cronů/e-mailové fronty proti lokálně běžící instanci
# (vyžaduje nastavené CRON_SECRET v prostředí, ze kterého skript spouštíte)
pnpm email:process         # zpracuje čekající MailQueue
pnpm probation:check       # spustí probation-notifications s force=true
pnpm offboarding:check     # spustí offboarding-notifications s force=true
```
