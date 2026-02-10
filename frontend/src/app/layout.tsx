import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/Providers"
import { AppShell } from "@/components/AppShell"
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Copilot Studio Social Monitor",
  description: "Monitor Reddit for Copilot Studio discussions and analyze sentiment",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CS Monitor",
  },
}

export const viewport: Viewport = {
  themeColor: "#0078d4",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head></head>
      <body className={inter.className}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
