"use client"

import { useEffect, useState, useCallback, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PostCard } from "@/components/PostCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getPosts, type Post } from "@/lib/api"
import { Search, RefreshCw } from "lucide-react"

export default function PostsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <PostsContent />
    </Suspense>
  )
}

function PostsContent() {
  const searchParams = useSearchParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: "",
    sentiment: "",
    search: "",
  })
  const initialLoadDone = useRef(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Load posts with given filters
  const loadPosts = useCallback(async (currentFilters: typeof filters) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (currentFilters.status) params.status = currentFilters.status
      if (currentFilters.sentiment) params.sentiment = currentFilters.sentiment
      if (currentFilters.search) params.search = currentFilters.search

      const data = await getPosts(params)
      setPosts(data)
    } catch (error) {
      console.error("Failed to load posts:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Sync filters from URL params and load posts
  useEffect(() => {
    const status = searchParams.get("status") || ""
    const sentiment = searchParams.get("sentiment") || ""
    const newFilters = { status, sentiment, search: filters.search }
    setFilters(newFilters)
    loadPosts(newFilters)
    initialLoadDone.current = true
  }, [searchParams])

  // Debounced search - reload after user stops typing
  function handleSearchChange(value: string) {
    setFilters(f => ({ ...f, search: value }))

    // Clear previous timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    // Debounce: wait 300ms after user stops typing
    searchTimeout.current = setTimeout(() => {
      loadPosts({ ...filters, search: value })
    }, 300)
  }

  // Handle filter dropdown changes
  function handleFilterChange(key: "status" | "sentiment", value: string) {
    const newValue = value === "all" ? "" : value
    const newFilters = { ...filters, [key]: newValue }
    setFilters(newFilters)
    loadPosts(newFilters)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Posts</h1>
          <p className="text-muted-foreground">
            Browse and manage scraped Reddit posts
          </p>
        </div>
        <Button onClick={() => loadPosts(filters)} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.status || "all"}
          onValueChange={(value) => handleFilterChange("status", value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="analyzed">Analyzed</SelectItem>
            <SelectItem value="handled">Handled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.sentiment || "all"}
          onValueChange={(value) => handleFilterChange("sentiment", value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search posts..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-[250px]"
        />

        {(filters.status || filters.sentiment || filters.search) && (
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = { status: "", sentiment: "", search: "" }
              setFilters(cleared)
              loadPosts(cleared)
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

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
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
