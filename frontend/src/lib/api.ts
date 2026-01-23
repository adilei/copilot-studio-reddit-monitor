const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Types
export interface Post {
  id: string
  subreddit: string
  title: string
  body: string | null
  author: string
  url: string
  score: number
  num_comments: number
  created_utc: string
  scraped_at: string
  status: "pending" | "analyzed" | "handled"
  latest_sentiment: "positive" | "neutral" | "negative" | null
  is_warning: boolean
  latest_sentiment_score: number | null
  has_contributor_reply: boolean
}

export interface PostDetail extends Post {
  analyses: Analysis[]
  contributor_replies: ContributorReply[]
}

export interface Analysis {
  id: number
  post_id: string
  summary: string
  sentiment: "positive" | "neutral" | "negative"
  is_warning: boolean
  sentiment_score: number | null
  key_issues: string[] | null
  analyzed_at: string
  model_used: string | null
}

export interface Contributor {
  id: number
  name: string
  reddit_handle: string
  role: string | null
  active: boolean
  created_at: string
  reply_count: number
}

export interface ContributorReply {
  id: number
  contributor_name: string
  contributor_handle: string
  comment_id: string
  replied_at: string
}

export interface ScrapeStatus {
  is_running: boolean
  last_run: string | null
  posts_scraped: number
  errors: string[]
}

export interface OverviewStats {
  total_posts: number
  posts_last_24h: number
  negative_percentage: number
  handled_count: number
  pending_count: number
  warning_count: number
  top_subreddit: string | null
}

export interface SentimentTrend {
  date: string
  positive: number
  neutral: number
  negative: number
  average_score: number
}

// API functions
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

// Posts
export async function getPosts(params?: {
  skip?: number
  limit?: number
  status?: string
  sentiment?: string
  search?: string
  sort_by?: string
  sort_order?: string
}): Promise<Post[]> {
  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }
  const query = searchParams.toString()
  return fetchApi<Post[]>(`/api/posts${query ? `?${query}` : ""}`)
}

export async function getPost(id: string): Promise<PostDetail> {
  return fetchApi<PostDetail>(`/api/posts/${id}`)
}

export async function updatePostStatus(
  id: string,
  status: Post["status"]
): Promise<Post> {
  return fetchApi<Post>(`/api/posts/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

export async function analyzePost(id: string): Promise<Analysis> {
  return fetchApi<Analysis>(`/api/posts/${id}/analyze`, {
    method: "POST",
  })
}

// Contributors
export async function getContributors(
  includeInactive?: boolean
): Promise<Contributor[]> {
  const query = includeInactive ? "?include_inactive=true" : ""
  return fetchApi<Contributor[]>(`/api/contributors${query}`)
}

export async function createContributor(data: {
  name: string
  reddit_handle: string
  role?: string
}): Promise<Contributor> {
  return fetchApi<Contributor>("/api/contributors", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function deleteContributor(id: number): Promise<void> {
  await fetchApi(`/api/contributors/${id}`, { method: "DELETE" })
}

// Analytics
export async function getOverviewStats(): Promise<OverviewStats> {
  return fetchApi<OverviewStats>("/api/analytics/overview")
}

export async function getSentimentTrends(days?: number): Promise<SentimentTrend[]> {
  const query = days ? `?days=${days}` : ""
  return fetchApi<SentimentTrend[]>(`/api/analytics/sentiment${query}`)
}

export async function getSubredditStats(): Promise<
  { subreddit: string; count: number }[]
> {
  return fetchApi("/api/analytics/subreddits")
}

export async function getContributorLeaderboard(): Promise<
  { name: string; reddit_handle: string; role: string | null; reply_count: number }[]
> {
  return fetchApi("/api/analytics/contributors/leaderboard")
}

export async function getStatusBreakdown(): Promise<
  { status: string; count: number }[]
> {
  return fetchApi("/api/analytics/status-breakdown")
}

// Scraper
export async function triggerScrape(params?: {
  time_range?: "day" | "week" | "month" | "all"
  subreddits?: string[]
  queries?: string[]
}): Promise<ScrapeStatus> {
  return fetchApi<ScrapeStatus>("/api/scrape", {
    method: "POST",
    body: JSON.stringify(params || {}),
  })
}

export async function getScrapeStatus(): Promise<ScrapeStatus> {
  return fetchApi<ScrapeStatus>("/api/scrape/status")
}
