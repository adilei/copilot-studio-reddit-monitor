"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  getOverviewStats,
  getScrapeStatus,
  triggerScrape,
  type OverviewStats,
  type ScrapeStatus,
} from "@/lib/api"
import { RefreshCw, FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react"

export function Dashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Auto-refresh while scraping is running
  useEffect(() => {
    if (!scrapeStatus?.is_running) return

    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [scrapeStatus?.is_running])

  async function loadData() {
    try {
      const [statsData, statusData] = await Promise.all([
        getOverviewStats(),
        getScrapeStatus(),
      ])
      setStats(statsData)
      setScrapeStatus(statusData)
    } catch (error) {
      console.error("Failed to load dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadScrapeStatus() {
    try {
      const statusData = await getScrapeStatus()
      setScrapeStatus(statusData)
    } catch (error) {
      console.error("Failed to load scrape status:", error)
    }
  }

  async function handleScrape() {
    setScraping(true)
    try {
      await triggerScrape({ time_range: "week" })
      await loadScrapeStatus()
    } catch (error) {
      console.error("Failed to trigger scrape:", error)
    } finally {
      setScraping(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading dashboard...</div>
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor Copilot Studio discussions on Reddit
          </p>
        </div>
        <Button
          onClick={handleScrape}
          disabled={scraping || scrapeStatus?.is_running}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${scrapeStatus?.is_running ? "animate-spin" : ""}`} />
          {scrapeStatus?.is_running ? "Scraping..." : "Scrape Now"}
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_posts || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.posts_today || 0} scraped today
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts?sentiment=negative")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negative Sentiment</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.negative_percentage?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              of analyzed posts
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts?status=handled")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Handled</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.handled_percentage?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              posts with MS response
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts?status=pending")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pending_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              awaiting analysis
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Scrape status */}
      {scrapeStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Scraper Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${scrapeStatus.is_running ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                <span>{scrapeStatus.is_running ? "Running" : "Idle"}</span>
              </div>
              {scrapeStatus.last_run && (
                <p className="text-sm text-muted-foreground">
                  Last run: {new Date(scrapeStatus.last_run).toLocaleString()}
                </p>
              )}
              {scrapeStatus.posts_scraped > 0 && (
                <p className="text-sm text-muted-foreground">
                  Posts scraped in last run: {scrapeStatus.posts_scraped}
                </p>
              )}
              {scrapeStatus.errors.length > 0 && (
                <div className="text-sm text-red-500">
                  Errors: {scrapeStatus.errors.join(", ")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.top_subreddit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Subreddit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">r/{stats.top_subreddit}</p>
            <p className="text-sm text-muted-foreground">Most posts collected from</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
