"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  getClusteringStatus,
  triggerClusteringRun,
  getThemes,
  getProductAreas,
  getHeatmapData,
  type ClusteringRun,
  type PainTheme,
  type ProductArea,
} from "@/lib/api"
import { RefreshCw, Play, Loader2, ChevronRight, AlertCircle, X, Check, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCanPerformActions } from "@/lib/permissions"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Minimum posts required for a theme to be "recurring" (shown in main list)
// Themes below this threshold are shown in the collapsible "emerging" section
const MIN_RECURRING_POSTS = parseInt(process.env.NEXT_PUBLIC_MIN_RECURRING_POSTS || '5', 10)

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

function ThemeCard({ theme, onClick }: { theme: PainTheme; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              {getSeverityBadge(theme.severity)}
              <h3 className="font-medium">{theme.name}</h3>
            </div>
            {theme.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {theme.description}
              </p>
            )}
            {theme.product_area_tags && theme.product_area_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {theme.product_area_tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {tag.name}
                    <span className="ml-1 text-muted-foreground">({tag.post_count})</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <span className="text-sm">{theme.post_count} posts</span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MultiSelectFilter({
  options,
  selected,
  onChange,
  themeCounts,
  placeholder = "Filter by product area",
}: {
  options: ProductArea[]
  selected: number[]
  onChange: (ids: number[]) => void
  themeCounts: Record<number, number>  // product_area_id -> theme count
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  const toggleOption = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const selectedNames = options
    .filter((o) => selected.includes(o.id))
    .map((o) => o.name)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="min-w-[200px] justify-start"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : selected.length === 1 ? (
            <span className="truncate">{selectedNames[0]}</span>
          ) : (
            <span>{selected.length} areas selected</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="max-h-[300px] overflow-y-auto">
          {options.map((option) => {
            const isSelected = selected.includes(option.id)
            const count = themeCounts[option.id] || 0
            return (
              <button
                key={option.id}
                onClick={() => toggleOption(option.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left",
                  isSelected && "bg-accent/50"
                )}
              >
                <div className={cn(
                  "h-4 w-4 border rounded flex items-center justify-center shrink-0",
                  isSelected ? "bg-primary border-primary" : "border-input"
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="flex-1 truncate">{option.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {count} {count === 1 ? "theme" : "themes"}
                </span>
              </button>
            )
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ClusteringPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()

  const [themes, setThemes] = useState<PainTheme[]>([])
  const [clusteringStatus, setClusteringStatus] = useState<ClusteringRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  // Product area filter state
  const [productAreas, setProductAreas] = useState<ProductArea[]>([])
  const [selectedProductAreaIds, setSelectedProductAreaIds] = useState<number[]>([])
  const [unclusteredCount, setUnclusteredCount] = useState(0)

  // View options state
  const [sortBy, setSortBy] = useState<'severity' | 'post_count' | 'newest' | 'name'>('severity')
  const [emergingExpanded, setEmergingExpanded] = useState(false)
  const [viewOptionsLoaded, setViewOptionsLoaded] = useState(false)

  // Load view options from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('clustering_view_options')
    // Clean up old keys
    localStorage.removeItem('clustering_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.sortBy) setSortBy(parsed.sortBy)
        if (parsed.emergingExpanded) setEmergingExpanded(parsed.emergingExpanded)
      } catch (e) {
        // Ignore invalid JSON
      }
    }
    setViewOptionsLoaded(true)
  }, [])

  // Save view options to localStorage when changed (only after initial load)
  useEffect(() => {
    if (viewOptionsLoaded) {
      localStorage.setItem('clustering_view_options', JSON.stringify({ sortBy, emergingExpanded }))
    }
  }, [sortBy, emergingExpanded, viewOptionsLoaded])

  // Parse URL params for initial filter state
  useEffect(() => {
    const paIdsParam = searchParams.get("product_area_ids")
    if (paIdsParam) {
      const ids = paIdsParam.split(",").map(Number).filter(Boolean)
      setSelectedProductAreaIds(ids)
    }
    loadInitialData()
  }, [])

  // Load themes when filter changes
  useEffect(() => {
    loadThemes()
    // Update URL
    if (selectedProductAreaIds.length > 0) {
      const params = new URLSearchParams()
      params.set("product_area_ids", selectedProductAreaIds.join(","))
      router.replace(`/clustering?${params.toString()}`, { scroll: false })
    } else {
      router.replace("/clustering", { scroll: false })
    }
  }, [selectedProductAreaIds])

  // Poll for status while clustering is running
  useEffect(() => {
    if (clusteringStatus?.status === "running") {
      const interval = setInterval(async () => {
        const status = await getClusteringStatus()
        setClusteringStatus(status)
        if (status?.status !== "running") {
          loadThemes()
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [clusteringStatus?.status])

  async function loadInitialData() {
    try {
      const [status, areas, heatmapData] = await Promise.all([
        getClusteringStatus(),
        getProductAreas(),
        getHeatmapData(),
      ])
      setClusteringStatus(status)
      setProductAreas(areas)
      setUnclusteredCount(heatmapData.unclustered_count)
      await loadThemes()
    } catch (error) {
      console.error("Failed to load clustering data:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadThemes() {
    try {
      const themesData = await getThemes({
        product_area_ids: selectedProductAreaIds.length > 0 ? selectedProductAreaIds : undefined,
      })
      setThemes(themesData)
    } catch (error) {
      console.error("Failed to load themes:", error)
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

  // Sort function for themes
  const sortThemes = (themesToSort: PainTheme[]) => {
    return [...themesToSort].sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          if (b.severity !== a.severity) return b.severity - a.severity
          return a.name.localeCompare(b.name)
        case 'post_count':
          if (b.post_count !== a.post_count) return b.post_count - a.post_count
          return b.severity - a.severity
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })
  }

  // Split themes into main (recurring) and emerging (below threshold)
  const mainThemes = sortThemes(themes.filter(t => t.post_count >= MIN_RECURRING_POSTS))
  const emergingThemes = sortThemes(themes.filter(t => t.post_count < MIN_RECURRING_POSTS))

  // Count stats (from main themes only for display)
  const totalPosts = mainThemes.reduce((sum, t) => sum + t.post_count, 0)

  // Compute theme counts per product area (from all themes)
  const themeCounts: Record<number, number> = {}
  themes.forEach((theme) => {
    if (theme.product_area_tags) {
      theme.product_area_tags.forEach((tag) => {
        themeCounts[tag.id] = (themeCounts[tag.id] || 0) + 1
      })
    }
  })

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
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
            onClick={() => loadThemes()}
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

      {/* Filter and Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelectFilter
          options={productAreas}
          selected={selectedProductAreaIds}
          onChange={setSelectedProductAreaIds}
          themeCounts={themeCounts}
          placeholder="Filter by product area"
        />
        {selectedProductAreaIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedProductAreaIds([])}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* Sort dropdown */}
        <Select value={sortBy} onValueChange={(val) => setSortBy(val as typeof sortBy)}>
          <SelectTrigger className="w-[160px] h-9">
            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-muted-foreground mr-1">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="severity">Severity</SelectItem>
            <SelectItem value="post_count">Post count</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{mainThemes.length} recurring themes</span>
        <span>{totalPosts} posts</span>
        {clusteringStatus?.completed_at && (
          <span>
            Last analyzed: {new Date(clusteringStatus.completed_at).toLocaleString()}
          </span>
        )}
      </div>

      {/* Selected Filters Display */}
      {selectedProductAreaIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing themes with posts in:</span>
          {selectedProductAreaIds.map((paId) => {
            const pa = productAreas.find((p) => p.id === paId)
            return pa ? (
              <Badge key={paId} variant="secondary" className="flex items-center gap-1">
                {pa.name}
                <button
                  onClick={() => setSelectedProductAreaIds(prev => prev.filter(id => id !== paId))}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null
          })}
        </div>
      )}

      {/* Main Theme Cards (2+ posts) */}
      {mainThemes.length > 0 ? (
        <div className="space-y-3">
          {mainThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              onClick={() => handleThemeClick(theme.id)}
            />
          ))}
        </div>
      ) : themes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            {selectedProductAreaIds.length > 0 ? (
              <p className="text-muted-foreground">
                No themes found for selected product areas.
              </p>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Emerging Themes Section (1 post each) */}
      {emergingThemes.length > 0 && (
        <div className="border-t pt-4">
          <button
            onClick={() => setEmergingExpanded(!emergingExpanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            {emergingExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>
              {emergingThemes.length} emerging {emergingThemes.length === 1 ? 'theme' : 'themes'} (&lt;{MIN_RECURRING_POSTS} posts)
            </span>
          </button>
          {emergingExpanded && (
            <div className="space-y-3 mt-4">
              {emergingThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  onClick={() => handleThemeClick(theme.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unclustered Posts Link */}
      {themes.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="p-0">
            <Link
              href="/posts?clustered=false"
              className="flex items-center justify-between p-4 hover:bg-accent rounded-lg transition-colors"
            >
              <span className="text-muted-foreground">
                View unclustered posts ({unclusteredCount})
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function ClusteringPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading themes...</div>}>
      <ClusteringPageContent />
    </Suspense>
  )
}
