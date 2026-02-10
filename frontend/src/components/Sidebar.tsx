"use client"

import Link from "next/link"
import { BarChart3, FileText, Users, Home, Grid3X3, Layers, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const navLinks = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/posts", icon: FileText, label: "Posts" },
  { href: "/clustering", icon: Grid3X3, label: "Themes" },
  { href: "/contributors", icon: Users, label: "Contributors" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/product-areas", icon: Layers, label: "Product Areas" },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="px-4 space-y-2">
      {navLinks.map(({ href, icon: Icon, label }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden md:block w-64 border-r bg-card shrink-0">
      <div className="p-6">
        <h1 className="text-lg font-semibold">Social Monitor</h1>
        <p className="text-sm text-muted-foreground">Copilot Studio</p>
      </div>
      <NavContent />
    </aside>
  )
}

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-64 bg-card border-r shadow-lg animate-in slide-in-from-left duration-200">
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Social Monitor</h1>
            <p className="text-sm text-muted-foreground">Copilot Studio</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <NavContent onNavigate={onClose} />
      </div>
    </div>
  )
}
