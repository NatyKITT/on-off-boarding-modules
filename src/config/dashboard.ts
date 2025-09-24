import { SidebarNavItem } from "@/types"
import { Role } from "@prisma/client"

export const sidebarLinks: SidebarNavItem[] = [
  {
    title: "MENU",
    items: [
      {
        href: "/admin",
        icon: "laptop",
        title: "Administrace",
        /*authorizeOnly: Role.ADMIN,*/
      },
      { href: "/prehled", icon: "dashboard", title: "Přehled" },
      {
        href: "/nastupy",
        icon: "user",
        title: "Nástupy",
        /*authorizeOnly: Role.ADMIN && Role.HR,*/
      },
      {
        href: "/odchody",
        icon: "user",
        title: "Odchody",
        /*authorizeOnly: Role.ADMIN && Role.HR,*/
      },
    ],
  },
  {
    title: "Systém",
    items: [
      { href: "/nastaveni", icon: "settings", title: "Nastavení" },
      { href: "/", icon: "home", title: "Domů" },
      {
        href: "#",
        icon: "messages",
        title: "Podpora",
        authorizeOnly: Role.USER,
        disabled: true,
      },
    ],
  },
]
