import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Link from "next/link"
import { BarChart3, FileText, Users, Home } from "lucide-react"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Copilot Studio Reddit Monitor",
  description: "Monitor Reddit for Copilot Studio discussions and analyze sentiment",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-64 border-r bg-card">
            <div className="p-6">
              <h1 className="text-lg font-semibold">Reddit Monitor</h1>
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
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
