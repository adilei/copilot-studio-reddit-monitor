"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getScrapeStatus,
  getClusteringStatus,
  getOverviewStats,
  getHeatmapData,
  getSchedulerStatus,
  type ScrapeStatus,
  type ClusteringRun,
  type OverviewStats,
  type SchedulerStatus,
} from "@/lib/api"
import { formatRelativeTime } from "@/lib/utils"
import { Rss, Brain, Bell, AlertCircle, CheckCircle, Clock, Loader2 } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

function formatTimeUntil(dateStr: string): string {
  const now = new Date()
  const then = new Date(dateStr)
  const diffInSeconds = Math.floor((then.getTime() - now.getTime()) / 1000)

  if (diffInSeconds < 0) return "overdue"
  if (diffInSeconds < 60) return "in <1m"
  if (diffInSeconds < 3600) return `in ${Math.floor(diffInSeconds / 60)}m`
  if (diffInSeconds < 86400) return `in ${Math.floor(diffInSeconds / 3600)}h ${Math.floor((diffInSeconds % 3600) / 60)}m`
  return `in ${Math.floor(diffInSeconds / 86400)}d`
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  )
}

export default function StatusPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null)
  const [clusteringStatus, setClusteringStatus] = useState<ClusteringRun | null>(null)
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null)
  const [unclusteredCount, setUnclusteredCount] = useState(0)
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading) {
      loadData()
    }
  }, [isAuthenticated, authLoading])

  // Poll while something is running
  const isAnythingRunning = scrapeStatus?.is_running || clusteringStatus?.status === "running"
  useEffect(() => {
    if (!isAnythingRunning) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [isAnythingRunning])

  async function loadData() {
    try {
      const [scrape, clustering, overview, heatmap, scheduler] = await Promise.all([
        getScrapeStatus(),
        getClusteringStatus(),
        getOverviewStats(),
        getHeatmapData(),
        getSchedulerStatus(),
      ])
      setScrapeStatus(scrape)
      setClusteringStatus(clustering)
      setOverviewStats(overview)
      setUnclusteredCount(heatmap.unclustered_count)
      setSchedulerStatus(scheduler)
    } catch (error) {
      console.error("Failed to load status data:", error)
    } finally {
      setLoading(false)
    }
  }

  function getJob(id: string) {
    return schedulerStatus?.jobs.find((j) => j.id === id)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading status...
        </div>
      </div>
    )
  }

  const scrapeJob = getJob("reddit_scrape")
  const analysisJob = getJob("analyze_pending")
  const notificationJob = getJob("generate_notifications")

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Status</h1>
        <p className="text-muted-foreground">Background jobs and processing queues</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Scraper Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Rss className="h-4 w-4" />
              Scraper
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            <StatusRow label="Source">
              {schedulerStatus?.scrape_source === "arctic_shift" ? "Arctic Shift" : "Reddit"}
            </StatusRow>
            <StatusRow label="Status">
              {scrapeStatus?.is_running ? (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  Idle
                </span>
              )}
            </StatusRow>
            <StatusRow label="Last run">
              {scrapeStatus?.last_run ? formatRelativeTime(scrapeStatus.last_run) : "Never"}
            </StatusRow>
            <StatusRow label="Posts last run">
              {scrapeStatus?.posts_scraped ?? 0}
            </StatusRow>
            <StatusRow label="Next run">
              {scrapeJob?.next_run ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatTimeUntil(scrapeJob.next_run)}
                </span>
              ) : "—"}
            </StatusRow>
            {scrapeJob?.interval_seconds && (
              <StatusRow label="Interval">
                Every {formatInterval(scrapeJob.interval_seconds)}
              </StatusRow>
            )}
            {scrapeStatus?.errors && scrapeStatus.errors.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {scrapeStatus.errors.length} error{scrapeStatus.errors.length > 1 ? "s" : ""}
                </div>
                {scrapeStatus.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-500 mt-1 truncate">{err}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Analysis & Clustering Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Analysis & Clustering
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            <StatusRow label="Awaiting analysis">
              {overviewStats?.not_analyzed_count ?? 0} posts
            </StatusRow>
            <StatusRow label="Next analysis run">
              {analysisJob?.next_run ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatTimeUntil(analysisJob.next_run)}
                </span>
              ) : "—"}
            </StatusRow>
            {analysisJob?.interval_seconds && (
              <StatusRow label="Analysis interval">
                Every {formatInterval(analysisJob.interval_seconds)}
              </StatusRow>
            )}
            <StatusRow label="Awaiting clustering">
              <Link href="/posts?clustered=false" className="text-amber-600 hover:underline">
                {unclusteredCount} posts
              </Link>
            </StatusRow>
            <StatusRow label="Clustering status">
              {clusteringStatus?.status === "running" ? (
                <span className="flex items-center gap-1 text-blue-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running ({clusteringStatus.run_type})
                </span>
              ) : clusteringStatus?.completed_at ? (
                <span>
                  {formatRelativeTime(clusteringStatus.completed_at)}
                  <span className="text-muted-foreground ml-1">({clusteringStatus.run_type})</span>
                </span>
              ) : "Never run"}
            </StatusRow>
            <StatusRow label="Next clustering">
              Runs after scrape
            </StatusRow>
            {clusteringStatus?.status === "failed" && (
              <div className="pt-2">
                <div className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  Last clustering failed
                </div>
                <p className="text-xs text-red-500 mt-1 truncate">
                  {clusteringStatus.error_message}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            <StatusRow label="Next check">
              {notificationJob?.next_run ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatTimeUntil(notificationJob.next_run)}
                </span>
              ) : "—"}
            </StatusRow>
            {notificationJob?.interval_seconds && (
              <StatusRow label="Interval">
                Every {formatInterval(notificationJob.interval_seconds)}
              </StatusRow>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
