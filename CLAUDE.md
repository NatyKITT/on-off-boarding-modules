# Project rules

## Jazyk odpovědí
- Odpovídej česky.
- Vysvětluj prakticky a konkrétně.

## Styl úprav
- U větších úprav vždy vrať celý opravený soubor, ne jen fragment.
- Neměň architekturu bez výslovného souhlasu.
- Nepřejmenovávej routy, modely, tabulky ani existující enum hodnoty bez výslovného souhlasu.
- Zachovej stávající UI komponenty a design systém.

## Projekt
- Aplikace je Next.js / TypeScript / Prisma HR aplikace pro nástupy, odchody a zaměstnanecké změny.
- Zaměstnanecké změny se nesmí propisovat do nástupů ani odchodů. Jsou jen informační vazba podle osobního čísla.
- Nástup ↔ odchod vazba je povolená a má fungovat automaticky podle osobního čísla kvůli informaci o odchodu a zastavení zkušebky.
- Mail worker pouze zpracovává MailQueue.
- Probation cron pouze vytváří notifikace/job do fronty.

## Před změnou
- Nejdřív vysvětli, které soubory budeš měnit.
- Před smazáním nebo přejmenováním souboru se vždy zeptej.
- Před úpravou Prisma schema se vždy zeptej.
- Před změnou migrací se vždy zeptej.

## Zakázané změny bez potvrzení
- Nemazat databázové modely.
- Nemazat migration files.
- Neměnit auth/rbac logiku bez potvrzení.
- Neměnit produkční URL, env názvy ani secrets.
- Nepřepisovat onboarding/offboarding daty ze zaměstnaneckých změn.