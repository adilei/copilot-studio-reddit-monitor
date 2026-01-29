"use client"

import Link from "next/link"
import { BarChart3, FileText, Users, Home, Grid3X3, Layers } from "lucide-react"

export function Sidebar() {
  return (
    <aside className="w-64 border-r bg-card">
      <div className="p-6">
        <h1 className="text-lg font-semibold">Social Monitor</h1>
        <p className="text-sm text-muted-foreground">Copilot Studio</p>
      </div>
      <nav className="px-4 space-y-2">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Link>
        <Link
          href="/posts"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <FileText className="h-4 w-4" />
          Posts
        </Link>
        <Link
          href="/clustering"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Grid3X3 className="h-4 w-4" />
          Themes
        </Link>
        <Link
          href="/contributors"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Users className="h-4 w-4" />
          Contributors
        </Link>
        <Link
          href="/analytics"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </Link>
        <Link
          href="/product-areas"
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
        >
          <Layers className="h-4 w-4" />
          Product Areas
        </Link>
      </nav>
    </aside>
  )
}
