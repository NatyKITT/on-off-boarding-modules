import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const DELETE = auth(async (req) => {
  if (!req.auth) {
    return new Response(
      JSON.stringify({ status: "error", message: "Musíte být přihlášeni." }),
      { status: 401 }
    )
  }

  const currentUser = req.auth.user

  if (!currentUser?.id) {
    return new Response(
      JSON.stringify({ status: "error", message: "Neplatný uživatel." }),
      { status: 401 }
    )
  }

  try {
    await prisma.user.delete({
      where: {
        id: currentUser.id,
      },
    })

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Uživatel byl úspěšně smazán.",
      }),
      { status: 200 }
    )
  } catch (error) {
    console.error("Chyba při mazání uživatele:", error)
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Došlo k interní chybě při mazání uživatele.",
      }),
      { status: 500 }
    )
  }
})
