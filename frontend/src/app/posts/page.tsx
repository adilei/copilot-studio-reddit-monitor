"use client"

import { useEffect, useState, useCallback, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { PostCard } from "@/components/PostCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getPosts, getProductAreas, type Post, type ProductArea } from "@/lib/api"
import { useContributor } from "@/lib/contributor-context"
import { RefreshCw, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

export default function PostsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <PostsContent />
    </Suspense>
  )
}

function ProductAreaFilter({
  options,
  selected,
  onChange,
  postCounts,
}: {
  options: ProductArea[]
  selected: number[]
  onChange: (ids: number[]) => void
  postCounts: Record<number, number>
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
          className="w-full sm:w-auto sm:min-w-[200px] justify-start"
        >
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Filter by product area</span>
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
            const count = postCounts[option.id] || 0
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
                  {count} {count === 1 ? "post" : "posts"}
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

function PostsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { contributor } = useContributor()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: "", // "waiting_for_pickup" | "in_progress" | "handled" | "my_checkouts" | ""
    sentiment: "",
    search: "",
    clustered: null as boolean | null, // true, false, or null (all)
    productAreaIds: [] as number[],
  })
  const [productAreas, setProductAreas] = useState<ProductArea[]>([])
  const [postCountsByArea, setPostCountsByArea] = useState<Record<number, number>>({})
  const initialLoadDone = useRef(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Load posts with given filters
  const loadPosts = useCallback(async (currentFilters: typeof filters, currentContributorId?: number) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | number[]> = {}

      // Handle unified status filter
      if (currentFilters.status === "my_checkouts" && currentContributorId) {
        params.checked_out_by = currentContributorId
      } else if (currentFilters.status && currentFilters.status !== "my_checkouts") {
        params.status = currentFilters.status
      }

      if (currentFilters.sentiment) params.sentiment = currentFilters.sentiment
      if (currentFilters.search) params.search = currentFilters.search
      if (currentFilters.clustered !== null) params.clustered = currentFilters.clustered
      if (currentFilters.productAreaIds.length > 0) params.product_area_ids = currentFilters.productAreaIds

      const data = await getPosts(params as Parameters<typeof getPosts>[0])
      setPosts(data)

      // Update post counts by area (from full dataset, not filtered)
      const counts: Record<number, number> = {}
      data.forEach((post) => {
        if (post.product_area_id) {
          counts[post.product_area_id] = (counts[post.product_area_id] || 0) + 1
        }
      })
      if (currentFilters.productAreaIds.length === 0) {
        setPostCountsByArea(counts)
      }
    } catch (error) {
      console.error("Failed to load posts:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load product areas on mount
  useEffect(() => {
    getProductAreas().then(setProductAreas).catch(console.error)
  }, [])

  // Sync filters from URL params and load posts
  useEffect(() => {
    const sentiment = searchParams.get("sentiment") || ""
    // Map legacy URL params to new unified status
    let status = searchParams.get("status") || ""
    if (!status) {
      const hasReply = searchParams.get("has_reply")
      const resolved = searchParams.get("resolved")
      if (hasReply === "true" || resolved === "true") {
        status = "handled"
      }
    }
    // Parse clustered param
    const clusteredParam = searchParams.get("clustered")
    const clustered = clusteredParam === "true" ? true : clusteredParam === "false" ? false : null
    // Parse product area ids
    const paIdsParam = searchParams.get("product_area_ids")
    const productAreaIds = paIdsParam ? paIdsParam.split(",").map(Number).filter(Boolean) : []
    const newFilters = { status, sentiment, search: filters.search, clustered, productAreaIds }
    setFilters(newFilters)
    loadPosts(newFilters, contributor?.id)
    initialLoadDone.current = true
  }, [searchParams, contributor?.id])

  // Debounced search - reload after user stops typing
  function handleSearchChange(value: string) {
    setFilters(f => ({ ...f, search: value }))

    // Clear previous timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    // Debounce: wait 300ms after user stops typing
    searchTimeout.current = setTimeout(() => {
      loadPosts({ ...filters, search: value }, contributor?.id)
    }, 300)
  }

  // Handle filter dropdown changes
  function handleFilterChange(key: "status" | "sentiment", value: string) {
    const newValue = value === "all" ? "" : value
    const newFilters = { ...filters, [key]: newValue }
    setFilters(newFilters)
    loadPosts(newFilters, contributor?.id)
    updateUrl(newFilters)
  }

  // Handle product area filter changes
  function handleProductAreaChange(ids: number[]) {
    const newFilters = { ...filters, productAreaIds: ids }
    setFilters(newFilters)
    loadPosts(newFilters, contributor?.id)
    updateUrl(newFilters)
  }

  // Update URL with current filters
  function updateUrl(currentFilters: typeof filters) {
    const params = new URLSearchParams()
    if (currentFilters.status) params.set("status", currentFilters.status)
    if (currentFilters.sentiment) params.set("sentiment", currentFilters.sentiment)
    if (currentFilters.clustered !== null) params.set("clustered", String(currentFilters.clustered))
    if (currentFilters.productAreaIds.length > 0) {
      params.set("product_area_ids", currentFilters.productAreaIds.join(","))
    }
    const newUrl = params.toString() ? `/posts?${params.toString()}` : "/posts"
    router.replace(newUrl, { scroll: false })
  }

  // Handle post update from PostCard (checkout/release)
  function handlePostUpdate(updatedPost: Post) {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {filters.clustered === false ? "Unclustered Posts" : "Posts"}
          </h1>
          <p className="text-muted-foreground">
            {filters.clustered === false
              ? "Posts not yet assigned to a theme"
              : "Browse and manage scraped Reddit posts"}
          </p>
        </div>
        <Button onClick={() => loadPosts(filters, contributor?.id)} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-6 items-end">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) => handleFilterChange("status", value)}
          >
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="All Posts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Posts</SelectItem>
              <SelectItem value="waiting_for_pickup">Waiting for Pickup</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="handled">Completed</SelectItem>
              {contributor && (
                <SelectItem value="my_checkouts">My Checkouts</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Sentiment</span>
          <Select
            value={filters.sentiment || "all"}
            onValueChange={(value) => handleFilterChange("sentiment", value)}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Product Area</span>
          <ProductAreaFilter
            options={productAreas}
            selected={filters.productAreaIds}
            onChange={handleProductAreaChange}
            postCounts={postCountsByArea}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Search</span>
          <Input
            placeholder="Search posts..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full sm:w-[250px]"
          />
        </div>

        {(filters.status || filters.sentiment || filters.search || filters.clustered !== null || filters.productAreaIds.length > 0) && (
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = { status: "", sentiment: "", search: "", clustered: null, productAreaIds: [] }
              setFilters(cleared)
              loadPosts(cleared, contributor?.id)
              router.replace("/posts", { scroll: false })
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Selected Filters Display */}
      {filters.productAreaIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Showing posts in:</span>
          {filters.productAreaIds.map((paId) => {
            const pa = productAreas.find((p) => p.id === paId)
            return pa ? (
              <Badge key={paId} variant="secondary" className="flex items-center gap-1">
                {pa.name}
                <button
                  onClick={() => handleProductAreaChange(filters.productAreaIds.filter(id => id !== paId))}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ) : null
          })}
        </div>
      )}

      {/* Posts list */}
      {loading ? (
        <div className="text-center py-8">Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No posts found. Try scraping Reddit first.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onPostUpdate={handlePostUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
