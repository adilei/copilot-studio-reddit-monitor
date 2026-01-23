"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  getOverviewStats,
  getScrapeStatus,
  triggerScrape,
  getWarningPosts,
  type OverviewStats,
  type ScrapeStatus,
  type WarningPost,
} from "@/lib/api"
import { RefreshCw, FileText, AlertTriangle, CheckCircle, Clock, AlertCircle } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils"
import Link from "next/link"

export function Dashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null)
  const [warningPosts, setWarningPosts] = useState<WarningPost[]>([])
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
      const [statsData, statusData, warnings] = await Promise.all([
        getOverviewStats(),
        getScrapeStatus(),
        getWarningPosts(5),
      ])
      setStats(statsData)
      setScrapeStatus(statusData)
      setWarningPosts(warnings)
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
              {stats?.posts_last_24h || 0} scraped in last 24h
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
              {stats?.handled_count || 0} / {stats?.total_posts || 0}
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

      {/* Boiling Posts tile */}
      {warningPosts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Boiling Posts ({warningPosts.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warningPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="block p-2 rounded-md hover:bg-orange-100 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-1 flex-1">
                      {post.title}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(post.created_utc)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    u/{post.author}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
