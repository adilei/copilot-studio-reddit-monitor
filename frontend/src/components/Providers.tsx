"use client"

import { ContributorProvider } from "@/lib/contributor-context"
import { ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return <ContributorProvider>{children}</ContributorProvider>
}
