"use client"

import { useAuth } from "@/lib/auth-context"
import { UnregisteredBanner } from "@/components/UnregisteredBanner"

export function UnregisteredGate({ children }: { children: React.ReactNode }) {
  const { user, authEnabled, isLoading } = useAuth()

  // If auth is disabled or still loading, show children
  if (!authEnabled || isLoading) {
    return <>{children}</>
  }

  // If user is authenticated but not registered, show the banner
  if (user && user.contributorId === null) {
    return <UnregisteredBanner />
  }

  // User is registered, show children
  return <>{children}</>
}
