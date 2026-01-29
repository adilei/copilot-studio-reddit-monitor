import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/Providers"
import { Sidebar } from "@/components/Sidebar"
import { Header } from "@/components/Header"
import { AuthGate } from "@/components/AuthGate"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Copilot Studio Social Monitor",
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
        <Providers>
          <AuthGate>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col">
                <Header />
                <main className="flex-1 overflow-auto">
                  {children}
                </main>
              </div>
            </div>
          </AuthGate>
        </Providers>
      </body>
    </html>
  )
}
