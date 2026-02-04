"use client"

import { useAuth } from "@/lib/auth-context"
import { AlertTriangle, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"

export function UnregisteredBanner() {
  const { user, authEnabled, logout } = useAuth()

  // Only show if auth is enabled, user is authenticated, but not registered
  if (!authEnabled || !user || user.contributorId !== null) {
    return null
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Access Required</h1>
          <p className="text-muted-foreground">
            You&apos;re signed in as <span className="font-medium">{user.email}</span>, but your account isn&apos;t registered for access to this tool.
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
          <p className="font-medium">To get access:</p>
          <p className="text-muted-foreground">
            Contact an admin and ask them to add your Microsoft alias (<span className="font-mono">{user.alias}</span>) to the contributors list.
          </p>
        </div>
        <Button variant="outline" onClick={logout}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
