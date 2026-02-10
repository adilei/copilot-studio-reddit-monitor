"use client"

import { AuthProvider } from "@/lib/auth-context"
import { ContributorProvider } from "@/lib/contributor-context"
import { NotificationProvider } from "@/lib/notification-context"
import { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ContributorProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </ContributorProvider>
    </AuthProvider>
  )
}
