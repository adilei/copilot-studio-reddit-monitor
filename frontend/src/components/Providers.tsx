"use client"

import { AuthProvider } from "@/lib/auth-context"
import { ContributorProvider } from "@/lib/contributor-context"
import { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ContributorProvider>{children}</ContributorProvider>
    </AuthProvider>
  )
}
