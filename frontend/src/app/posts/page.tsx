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
import { useContributor } from "@/lib/contributor-context"
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
  const { contributor } = useContributor()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    analyzed: "", // "true" | "false" | ""
    sentiment: "",
    search: "",
    checkout: "", // "my_checkouts" | "available" | ""
    hasReply: "", // "true" | "false" | ""
  })
  const initialLoadDone = useRef(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Load posts with given filters
  const loadPosts = useCallback(async (currentFilters: typeof filters, currentContributorId?: number) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = {}
      if (currentFilters.analyzed) params.analyzed = currentFilters.analyzed === "true"
      if (currentFilters.sentiment) params.sentiment = currentFilters.sentiment
      if (currentFilters.search) params.search = currentFilters.search
      if (currentFilters.checkout === "my_checkouts" && currentContributorId) {
        params.checked_out_by = currentContributorId
      }
      if (currentFilters.checkout === "available") {
        params.available_only = true
      }
      if (currentFilters.hasReply) params.has_reply = currentFilters.hasReply === "true"

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
    const analyzed = searchParams.get("analyzed") || ""
    const sentiment = searchParams.get("sentiment") || ""
    const hasReply = searchParams.get("has_reply") || ""
    const newFilters = { analyzed, sentiment, search: filters.search, checkout: filters.checkout, hasReply }
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
  function handleFilterChange(key: "analyzed" | "sentiment" | "checkout" | "hasReply", value: string) {
    const newValue = value === "all" ? "" : value
    const newFilters = { ...filters, [key]: newValue }
    setFilters(newFilters)
    loadPosts(newFilters, contributor?.id)
  }

  // Handle post update from PostCard (checkout/release)
  function handlePostUpdate(updatedPost: Post) {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
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
        <Button onClick={() => loadPosts(filters, contributor?.id)} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.analyzed || "all"}
          onValueChange={(value) => handleFilterChange("analyzed", value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Analysis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="true">Analyzed</SelectItem>
            <SelectItem value="false">Not Analyzed</SelectItem>
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

        <Select
          value={filters.hasReply || "all"}
          onValueChange={(value) => handleFilterChange("hasReply", value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="MS Reply" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="true">Has Reply</SelectItem>
            <SelectItem value="false">No Reply</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.checkout || "all"}
          onValueChange={(value) => handleFilterChange("checkout", value)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Checkout" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            {contributor && (
              <SelectItem value="my_checkouts">My Checkouts</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search posts..."
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-[250px]"
        />

        {(filters.analyzed || filters.sentiment || filters.search || filters.checkout || filters.hasReply) && (
          <Button
            variant="ghost"
            onClick={() => {
              const cleared = { analyzed: "", sentiment: "", search: "", checkout: "", hasReply: "" }
              setFilters(cleared)
              loadPosts(cleared, contributor?.id)
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
            <PostCard key={post.id} post={post} onPostUpdate={handlePostUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
