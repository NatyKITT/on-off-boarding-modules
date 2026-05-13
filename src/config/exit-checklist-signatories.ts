export type ExitChecklistSignatory = {
  name: string
  emails: string[]
  rowKeys: string[]
}

export const EXIT_CHECKLIST_SIGNATORIES: ExitChecklistSignatory[] = [
  {
    name: "Marek Tolde (SNEO, a.s.)",
    emails: ["mtolde@praha6.cz"],
    rowKeys: ["sneoChip", "sneoRemote"],
  },
  {
    name: "Ing. Martina Krýzová (vedoucí Odd. vnitřní správy, Odbor služeb)",
    emails: ["mkryzova@praha6.cz"],
    rowKeys: ["serviceTools"],
  },
  {
    name: "Vedoucí odboru",
    emails: [],
    rowKeys: ["handoverProtocol"],
  },
  {
    name: "Hana Štičková (vedoucí Odd. spisové služby, Kancelář tajemníka)",
    emails: ["hstickova@praha6.cz"],
    rowKeys: ["centralRegistry"],
  },
  {
    name: "Mgr. Petr Duben (vedoucí Odd. krizového řízení a bezpečnosti, Kancelář tajemníka)",
    emails: ["pduben@praha6.cz"],
    rowKeys: ["classifiedDocs"],
  },
  {
    name: "Mgr. Lenka Kratochvílová (vedoucí Odboru služeb)",
    emails: ["lkratochvilova@praha6.cz"],
    rowKeys: ["electronicTicket", "carChip", "cashAdvance"],
  },
  {
    name: "Mgr. Michaela Aronová (vedoucí Personální oddělení, Kancelář tajemníka)",
    emails: ["maronova@praha6.cz"],
    rowKeys: ["serviceId"],
  },
  {
    name: "Gabriela Krupařová (mzdová účetní)",
    emails: ["gkruparova@praha6.cz"],
    rowKeys: ["socialFundLoan"],
  },
  {
    name: "Petr Štola (mzdový účetní)",
    emails: ["pstola@praha6.cz"],
    rowKeys: ["socialFundLoan"],
  },
  {
    name: "Vladimír Šuvarina (ředitel KITT6)",
    emails: ["vsuvarina@praha6.cz"],
    rowKeys: ["phoneCosts", "itEquipment", "espis"],
  },
  {
    name: "Ing. Blanka Zavřelová (vedoucí Odd. místních příjmů, Ekonomický odbor)",
    emails: ["bzavrelova@praha6.cz"],
    rowKeys: ["fineBlocks"],
  },
]

export const LAW_SIGNATORY: ExitChecklistSignatory = {
  name: "Ing. Miroslava Bečičková (referent veřejných zakázek, Právní odbor)",
  emails: ["mbecickova@praha6.cz"],
  rowKeys: ["lawInfo"],
}