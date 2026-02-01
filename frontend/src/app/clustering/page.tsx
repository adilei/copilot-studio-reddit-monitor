"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getHeatmapData,
  getClusteringStatus,
  triggerClusteringRun,
  type HeatmapResponse,
  type HeatmapCell,
  type ClusteringRun,
} from "@/lib/api"
import { RefreshCw, Play, Loader2, ChevronRight, AlertCircle } from "lucide-react"
import { useCanPerformActions } from "@/lib/permissions"

function getSeverityBadge(severity: number) {
  switch (severity) {
    case 5:
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>
    case 4:
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">High</Badge>
    case 3:
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>
    case 2:
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>
    case 1:
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Minor</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

function ThemeRow({ theme, onClick }: { theme: HeatmapCell; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors text-left"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {getSeverityBadge(theme.severity)}
        <span className="truncate">{theme.theme_name}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-sm">{theme.post_count} posts</span>
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  )
}

export default function ClusteringPage() {
  const router = useRouter()
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null)
  const [clusteringStatus, setClusteringStatus] = useState<ClusteringRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Poll for status while clustering is running
  useEffect(() => {
    if (clusteringStatus?.status === "running") {
      const interval = setInterval(async () => {
        const status = await getClusteringStatus()
        setClusteringStatus(status)
        if (status?.status !== "running") {
          loadData()
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [clusteringStatus?.status])

  async function loadData() {
    try {
      const [heatmap, status] = await Promise.all([
        getHeatmapData(),
        getClusteringStatus(),
      ])
      setHeatmapData(heatmap)
      setClusteringStatus(status)
    } catch (error) {
      console.error("Failed to load clustering data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRunClustering(runType: "full" | "incremental") {
    setTriggering(true)
    try {
      const run = await triggerClusteringRun(runType)
      setClusteringStatus(run)
    } catch (error) {
      console.error("Failed to trigger clustering:", error)
      alert("Failed to trigger clustering. A run may already be in progress.")
    } finally {
      setTriggering(false)
    }
  }

  function handleThemeClick(themeId: number) {
    router.push(`/clustering/theme?id=${themeId}`)
  }

  if (loading) {
    return <div className="p-8 text-center">Loading themes...</div>
  }

  const isRunning = clusteringStatus?.status === "running"

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Themes</h1>
          <p className="text-muted-foreground">
            Recurring issues discovered from Reddit posts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData()}
            disabled={isRunning}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRunClustering("incremental")}
            disabled={isRunning || triggering || !canPerformActions}
            title={!canPerformActions ? permissionReason ?? undefined : undefined}
          >
            {triggering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Analyze New Posts
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleRunClustering("full")}
            disabled={isRunning || triggering || !canPerformActions}
            title={!canPerformActions ? permissionReason ?? undefined : undefined}
          >
            {triggering ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Re-analyze All
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {isRunning && clusteringStatus && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-800">
                Analyzing posts... {clusteringStatus.posts_processed} processed
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {clusteringStatus?.status === "failed" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-800">
                Analysis failed: {clusteringStatus.error_message}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      {heatmapData && heatmapData.total_themes > 0 && (
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>{heatmapData.total_themes} themes</span>
          <span>{heatmapData.total_posts} posts categorized</span>
          <span>{heatmapData.unclustered_count} unclustered</span>
          {heatmapData.last_clustering_run && (
            <span>
              Last analyzed: {new Date(heatmapData.last_clustering_run.completed_at!).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Themes by Product Area */}
      {heatmapData && heatmapData.rows.length > 0 ? (
        <div className="space-y-4">
          {heatmapData.rows.map((row) => (
            <Card key={row.product_area_id ?? "uncategorized"}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    {row.product_area_name}
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {row.total_posts} posts
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y">
                  {row.themes.map((theme) => (
                    <ThemeRow
                      key={theme.theme_id}
                      theme={theme}
                      onClick={() => handleThemeClick(theme.theme_id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Unclustered Posts */}
          {heatmapData.unclustered_count > 0 && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium text-muted-foreground">
                    Unclustered
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {heatmapData.unclustered_count} posts
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Link
                  href="/posts?clustered=false"
                  className="flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors"
                >
                  <span className="text-muted-foreground">
                    Posts not yet assigned to a theme
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No themes discovered yet. Run analysis to identify recurring issues from posts.
            </p>
            <Button
              onClick={() => handleRunClustering("full")}
              disabled={isRunning || triggering || !canPerformActions}
              title={!canPerformActions ? permissionReason ?? undefined : undefined}
            >
              {triggering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Analyze Posts
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
