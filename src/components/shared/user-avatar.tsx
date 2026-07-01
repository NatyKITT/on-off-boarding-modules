import type { User } from "@prisma/client"
import type { AvatarProps } from "@radix-ui/react-avatar"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UserAvatarProps extends AvatarProps {
  user: Pick<User, "image" | "name"> & {
    surname?: string | null
    email?: string | null
  }
  showImage?: boolean
}

function getInitialsFromEmail(email?: string | null) {
  const localPart = email?.split("@")[0]?.trim().toLowerCase()

  if (!localPart) return null

  const separatedParts = localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)

  if (separatedParts.length >= 2) {
    return separatedParts
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 3)
  }

  return localPart.slice(0, 2).toUpperCase()
}

function getUserInitials(user: UserAvatarProps["user"]) {
  return getInitialsFromEmail(user.email) ?? "U"
}

export function UserAvatar({
  user,
  showImage = false,
  ...props
}: UserAvatarProps) {
  const initials = getUserInitials(user)
  const shouldShowImage = showImage && Boolean(user.image)

  return (
    <Avatar {...props}>
      {shouldShowImage ? (
        <AvatarImage
          alt="Profilová fotka"
          src={user.image ?? ""}
          referrerPolicy="no-referrer"
        />
      ) : (
        <AvatarFallback
          className="
            bg-gradient-to-br from-[#00847C] to-[#0B6D73]
            text-[13px] font-bold uppercase leading-none tracking-[0.02em]
            text-white shadow-sm ring-1 ring-white/50
          "
        >
          <span className="sr-only">
            {user.name ?? user.email ?? "Uživatel"}
          </span>
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  )
}
