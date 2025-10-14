"use client"

import {
  createContext,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react"

import { useSignInModal } from "@/components/modals/sign-in-modal"

export const ModalContext = createContext<{
  setShowSignInModal: Dispatch<SetStateAction<boolean>>
}>({
  setShowSignInModal: () => {},
})

ModalProvider.displayName = "ModalProvider"

export default function ModalProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { SignInModal, setShowSignInModal } = useSignInModal()

  const value = useMemo(() => ({ setShowSignInModal }), [setShowSignInModal])

  return (
    <ModalContext.Provider value={value}>
      <SignInModal />
      {children}
    </ModalContext.Provider>
  )
}
