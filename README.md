# Modul pro nástupy a odchody zaměstnanců (Praha6 a KITT6)

Interní aplikace pro správu onboarding a offboarding procesů ve veřejné správě pro MÚ pro Prahu 6 a příspěvkovou organizaci KITT6. Umožňuje efektivní spolupráci mezi HR, IT a vedením při zajištění nástupu nebo odchodu zaměstnanců.

## 🔧 Technologie

- [Next.js 14](https://nextjs.org/)
- TypeScript + Tailwind CSS + shadcn/ui
- Autentizace přes NextAuth (Google OAuth)
- Role-based přístup: `USER`, `HR`, `IT`, `ADMIN`
- Databáze: MySQL (Prisma ORM)
- E-maily: Resend + React Email
- Validace vstupů přes Zod
- Smooth scrolling (Lenis), přepínání motivů (light/dark)

## ✅ Funkce

- Správa nástupů a odchodů (oddělené podle role)
- Uživatelé a jejich oprávnění (včetně nastavení)
- Záznamy s přehledem podle měsíců
- Zobrazení detailu nástupu/odchodu s checklistem
- Připraveno pro více typů e-mailových oznámení (např. HR/IT notifikace)

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
