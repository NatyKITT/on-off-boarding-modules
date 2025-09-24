import { Role } from "@prisma/client"

import { Icons } from "@/components/shared/icons"

export type SiteConfig = {
  name: string
  description: string
  url: string
  ogImage: string
  author: string
  mailSupport: string
  hostingRegion: string
  keywords: string[]
}

export type NavItem = {
  title: string
  href: string
  badge?: number
  disabled?: boolean
  external?: boolean
  authorizeOnly?: Role
  icon?: keyof typeof Icons
}

export type SidebarNavItem = {
  title: string
  items: NavItem[]
  authorizeOnly?: Role
  icon?: keyof typeof Icons
}
