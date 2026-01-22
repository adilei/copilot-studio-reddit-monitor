"use client"

import { useEffect, useState } from "react"
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
  const searchParams = useSearchParams()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: "",
    sentiment: "",
    subreddit: "",
  })

  // Initialize filters from URL params
  useEffect(() => {
    const status = searchParams.get("status") || ""
    const sentiment = searchParams.get("sentiment") || ""
    setFilters(f => ({ ...f, status, sentiment }))
  }, [searchParams])

  useEffect(() => {
    loadPosts()
  }, [filters])

  async function loadPosts() {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filters.status) params.status = filters.status
      if (filters.sentiment) params.sentiment = filters.sentiment
      if (filters.subreddit) params.subreddit = filters.subreddit

      const data = await getPosts(params)
      setPosts(data)
    } catch (error) {
      console.error("Failed to load posts:", error)
    } finally {
      setLoading(false)
    }
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
        <Button onClick={loadPosts} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, status: value === "all" ? "" : value }))
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="analyzed">Analyzed</SelectItem>
            <SelectItem value="handled">Handled</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.sentiment}
          onValueChange={(value) =>
            setFilters((f) => ({ ...f, sentiment: value === "all" ? "" : value }))
          }
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
          placeholder="Filter by subreddit..."
          value={filters.subreddit}
          onChange={(e) =>
            setFilters((f) => ({ ...f, subreddit: e.target.value }))
          }
          className="w-[200px]"
        />

        {(filters.status || filters.sentiment || filters.subreddit) && (
          <Button
            variant="ghost"
            onClick={() => setFilters({ status: "", sentiment: "", subreddit: "" })}
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
