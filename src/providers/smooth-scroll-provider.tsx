"use client"

import * as React from "react"
import { ReactLenis } from "lenis/react"

export function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.5,
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  )
}
