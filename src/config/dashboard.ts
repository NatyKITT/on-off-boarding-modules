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
        authorizeOnly: Role.ADMIN,
      },
      { href: "/prehled", icon: "dashboard", title: "Přehled" },
      {
        href: "/nastupy",
        icon: "userPlus",
        title: "Nástupy",
      },
      {
        href: "/odchody",
        icon: "userMinus",
        title: "Odchody",
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
