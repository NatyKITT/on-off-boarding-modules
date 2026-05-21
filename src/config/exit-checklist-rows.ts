import type { ExitChecklistRowDefinition } from "@/types/exit-checklist"

export const EXIT_CHECKLIST_ROWS: ExitChecklistRowDefinition[] = [
  {
    key: "handoverProtocol",
    organization: "Vedoucí odboru",
    obligation: "předávací protokol (v písemné formě)",
  },
  {
    key: "sneoChip",
    organization:
      "Správa objektu – SNEO, a.s.\nMarek Tolde\nPřízemí - č. dv. 008",
    obligation: "identifikační karta (čip) zaměstnance",
  },
  {
    key: "sneoRemote",
    organization:
      "Správa objektu – SNEO, a.s.\nMarek Tolde\nPřízemí - č. dv. 008",
    obligation: "dálkový/é ovladač/e (garáže, dvůr)",
  },
  {
    key: "electronicTicket",
    organization:
      "Vedoucí Odboru služeb\nMgr. Lenka Kratochvílová\nPřízemí - č. dv. 001",
    obligation: "vyrovnání alikvotní částky z elektronické jízdenky",
  },
  {
    key: "carChip",
    organization:
      "Vedoucí Odboru služeb\nMgr. Lenka Kratochvílová\nPřízemí - č. dv. 001",
    obligation: "čip/y od služebního vozidla",
  },
  {
    key: "cashAdvance",
    organization:
      "Vedoucí Odboru služeb\nMgr. Lenka Kratochvílová\nPřízemí - č. dv. 001",
    obligation: "vyúčtování hotovostní zálohy",
  },
  {
    key: "serviceTools",
    organization: "Odbor služeb\nIng. Martina Krýzová\nPřízemí - č. dv. 006",
    obligation: "služební pomůcky",
  },
  {
    key: "serviceId",
    organization:
      "Vedoucí personálního oddělení\nKancelář tajemníka\nMgr. Michaela Aronová - č. dv. 521",
    obligation: "služební průkaz",
  },
  {
    key: "centralRegistry",
    organization:
      "Vedoucí oddělení spisové služby\nKancelář tajemníka\nHana Štičková - č. dv. 119",
    obligation: "závazky ve vztahu k centrální spisovně",
  },
  {
    key: "classifiedDocs",
    organization:
      "Vedoucí oddělení krizového řízení a bezpečnosti\nKancelář tajemníka\nMgr. Petr Duben - č. dv. 617A",
    obligation: "utajované písemnosti",
  },
  {
    key: "fineBlocks",
    organization:
      "Vedoucí oddělení místních příjmů\nEkonomický odbor\nIng. Blanka Zavřelová - č. dv. 513",
    obligation: "příkazové bloky na pokuty a jejich vyúčtování",
  },
  {
    key: "socialFundLoan",
    organization:
      "Vedoucí oddělení platové a mzdové účtárny\nEkonomický odbor\nIng. Miroslava Neugebauerová\nč. dv. 519",
    obligation: "vč. půjčky ze SF",
  },
  {
    key: "phoneCosts",
    organization:
      "Ředitel KITT6\nVladimír Šuvarina\nKITT6, Dr. Zikmunda Wintra 768/20",
    obligation:
      "úhrada nákladů za telefonní hovory přesahující měsíční finanční limit",
  },
  {
    key: "itEquipment",
    organization:
      "Ředitel KITT6\nVladimír Šuvarina\nKITT6, Dr. Zikmunda Wintra 768/20",
    obligation:
      "výpočetní technika, mobilní telefon, fotopřístroje (viz B. Výpis z osobní karty)",
  },
  {
    key: "espis",
    organization:
      "Ředitel KITT6\nVladimír Šuvarina\nKITT6, Dr. Zikmunda Wintra 768/20",
    obligation: "e-spis – kontrola předání dokumentů (viz C. Předávaná agenda)",
  },
  {
    key: "lawInfo",
    organization: "Právní odbor\nIng. Miroslava Bečičková - č. dv. 507",
    obligation:
      "Podání informace v návaznosti na ust. § 14a odst. 3 zákona č.159/2006 Sb., o střetu zájmů",
  },
]
