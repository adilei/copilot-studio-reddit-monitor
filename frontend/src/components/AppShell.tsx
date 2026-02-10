"use client"

import { useState } from "react"
import { Sidebar, MobileDrawer } from "@/components/Sidebar"
import { Header } from "@/components/Header"
import { AuthGate } from "@/components/AuthGate"
import { UnregisteredGate } from "@/components/UnregisteredGate"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
          <UnregisteredGate>
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </UnregisteredGate>
        </div>
      </div>
    </AuthGate>
  )
}
