"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getOverviewStats,
  getScrapeStatus,
  getWarningPosts,
  type OverviewStats,
  type ScrapeStatus,
  type WarningPost,
} from "@/lib/api"
import { FileText, AlertTriangle, CheckCircle, Clock, AlertCircle, UserCheck } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

export function Dashboard() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null)
  const [warningPosts, setWarningPosts] = useState<WarningPost[]>([])
  const [totalWarningCount, setTotalWarningCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Wait for auth to be fully initialized before fetching data
  // This prevents race condition where loadData fires before token getter is registered
  useEffect(() => {
    if (!authLoading) {
      loadData()
    }
  }, [isAuthenticated, authLoading])

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
        getWarningPosts(50, true),
      ])
      setStats(statsData)
      setScrapeStatus(statusData)
      setTotalWarningCount(warnings.length)
      setWarningPosts(warnings.slice(0, 5))
    } catch (error) {
      console.error("Failed to load dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading dashboard...</div>
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor Copilot Studio discussions on Reddit
        </p>
      </div>

      {/* Stats cards - human workflow status */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
          onClick={() => router.push("/posts?status=waiting_for_pickup")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waiting for Pickup</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.awaiting_pickup_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              need attention
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts?status=in_progress")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.in_progress_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              checked out
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/posts?status=handled")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.handled_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              MS response or resolved
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
              of analyzed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Boiling Posts tile */}
      {totalWarningCount > 0 ? (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Boiling Posts
                <span className="text-sm font-normal text-muted-foreground">
                  ({warningPosts.length} of {totalWarningCount})
                </span>
              </CardTitle>
              <Link
                href="/posts?sentiment=negative&status=unhandled"
                className="text-sm text-orange-600 hover:text-orange-800 hover:underline"
              >
                View all negative →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warningPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/detail?id=${post.id}`}
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
      ) : (stats?.unhandled_negative_count ?? 0) > 0 ? (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-6 pb-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-yellow-800">No Boiling Posts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No urgent issues, but {stats?.unhandled_negative_count} negative sentiment post{(stats?.unhandled_negative_count ?? 0) !== 1 ? 's' : ''} still need attention.
              </p>
              <Link
                href="/posts?sentiment=negative&status=unhandled"
                className="text-sm text-yellow-700 hover:text-yellow-900 hover:underline mt-2 inline-block"
              >
                View negative posts →
              </Link>
              <div className="mt-4">
                <img src="/yellow-cat.png" alt="Cat taking notes" className="h-48 mx-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6 pb-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-green-800">All Clear!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No unhandled negative sentiment posts. Great job keeping up with the community!
              </p>
              <Link
                href="/posts?status=waiting_for_pickup"
                className="text-sm text-green-600 hover:text-green-800 hover:underline mt-2 inline-block"
              >
                View all unhandled posts →
              </Link>
              <div className="mt-4">
                <img src="/green-cat.png" alt="Happy cat celebrating" className="h-48 mx-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scrape/Sync status */}
      {scrapeStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Data Freshness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${scrapeStatus.is_running ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                <span>{scrapeStatus.is_running ? "Scraping..." : "Idle"}</span>
              </div>

              {/* Show scrape info */}
              {scrapeStatus.last_run && (
                <div className="text-sm">
                  <p className="font-medium">Last scraped</p>
                  <p className="text-muted-foreground">
                    {new Date(scrapeStatus.last_run).toLocaleString()}
                    {scrapeStatus.posts_scraped > 0 && ` (${scrapeStatus.posts_scraped} posts)`}
                  </p>
                </div>
              )}

              {/* Show sync info if this server received synced data */}
              {scrapeStatus.last_synced_at && (
                <div className="text-sm border-t pt-2">
                  <p className="font-medium">Last synced</p>
                  <p className="text-muted-foreground">
                    Received: {new Date(scrapeStatus.last_synced_at).toLocaleString()}
                    {scrapeStatus.last_sync_posts > 0 && ` (${scrapeStatus.last_sync_posts} posts)`}
                  </p>
                  {scrapeStatus.last_sync_source_scraped_at && (
                    <p className="text-muted-foreground">
                      Source scraped: {new Date(scrapeStatus.last_sync_source_scraped_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Analysis status - automated process */}
              {stats && stats.not_analyzed_count > 0 && (
                <div className="text-sm border-t pt-2">
                  <p className="font-medium">Analysis Queue</p>
                  <p className="text-muted-foreground">
                    {stats.not_analyzed_count} posts awaiting analysis
                  </p>
                </div>
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
