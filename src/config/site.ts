import { SidebarNavItem, SiteConfig } from "@/types"

import { env } from "@/env.mjs"

const site_url = env.NEXT_PUBLIC_APP_URL

export const siteConfig: SiteConfig = {
  name: "On/Off Boarding Module",
  description:
    "Interní aplikace pro správu nástupů a odchodů zaměstnanců v rámci KITT6. Umožňuje efektivní spolupráci mezi HR, IT a vedením při onboardingu a offboardingu.",
  url: site_url,
  ogImage: `${site_url}/assets/og.png`,
  author: "Tým KITT6",
  hostingRegion: "fra1",
  keywords: ["onboarding", "offboarding", "HR", "firemní nástupy", "KITT6"],
  mailSupport: "podpora@kitt6.cz",
}

export const footerLinks: SidebarNavItem[] = [
  {
    title: "O aplikaci",
    items: [
      { title: "Dokumentace", href: "/dokumentace" },
      { title: "Podmínky použití", href: "/terms" },
      { title: "Zásady ochrany osobních údajů", href: "/privacy" },
    ],
  },
]
