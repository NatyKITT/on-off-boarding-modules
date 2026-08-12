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
      { href: "/nastupy", icon: "userPlus", title: "Nástupy" },
      { href: "/odchody", icon: "userMinus", title: "Odchody" },
      { href: "/zmeny", icon: "arrowLeftRight", title: "Změny" },
    ],
  },
  {
    title: "Nástroje",
    items: [
      {
        href: "/dokumenty",
        icon: "fileText",
        title: "Dokumenty",
        authorizeOnly: [Role.ADMIN, Role.HR, Role.IT],
      },
      { href: "/statistiky", icon: "lineChart", title: "Statistiky" },
      {
        href: "/nastaveni",
        icon: "settings",
        title: "Nastavení",
        authorizeOnly: Role.ADMIN,
      },
      { href: "/prehled", icon: "home", title: "Domů" },
    ],
  },
]
