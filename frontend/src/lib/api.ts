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
  is_analyzed: boolean
  latest_sentiment: "positive" | "neutral" | "negative" | null
  is_warning: boolean
  latest_sentiment_score: number | null
  has_contributor_reply: boolean
  checked_out_by: number | null
  checked_out_by_name: string | null
  checked_out_at: string | null
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
  // Sync info (for destination servers receiving synced data)
  last_synced_at: string | null
  last_sync_source_scraped_at: string | null
  last_sync_posts: number
}

export interface OverviewStats {
  total_posts: number
  posts_last_24h: number
  negative_percentage: number
  analyzed_count: number
  not_analyzed_count: number
  has_reply_count: number
  warning_count: number
  in_progress_count: number
  awaiting_pickup_count: number
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
  analyzed?: boolean
  sentiment?: string
  search?: string
  sort_by?: string
  sort_order?: string
  checked_out_by?: number
  available_only?: boolean
  has_reply?: boolean
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

export async function analyzePost(id: string): Promise<Analysis> {
  return fetchApi<Analysis>(`/api/posts/${id}/analyze`, {
    method: "POST",
  })
}

export async function checkoutPost(
  id: string,
  contributorId: number
): Promise<Post> {
  return fetchApi<Post>(`/api/posts/${id}/checkout`, {
    method: "POST",
    body: JSON.stringify({ contributor_id: contributorId }),
  })
}

export async function releasePost(
  id: string,
  contributorId: number
): Promise<Post> {
  return fetchApi<Post>(`/api/posts/${id}/release`, {
    method: "POST",
    body: JSON.stringify({ contributor_id: contributorId }),
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

// Warnings
export interface WarningPost {
  id: string
  title: string
  author: string
  created_utc: string
  is_analyzed: boolean
  has_contributor_reply: boolean
  sentiment: "positive" | "neutral" | "negative" | null
  summary: string | null
}

export async function getWarningPosts(limit?: number): Promise<WarningPost[]> {
  const query = limit ? `?limit=${limit}` : ""
  return fetchApi<WarningPost[]>(`/api/analytics/warnings${query}`)
}

// Product Areas
export interface ProductArea {
  id: number
  name: string
  description: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  theme_count: number
}

export async function getProductAreas(
  includeInactive?: boolean
): Promise<ProductArea[]> {
  const query = includeInactive ? "?include_inactive=true" : ""
  return fetchApi<ProductArea[]>(`/api/product-areas${query}`)
}

export async function createProductArea(data: {
  name: string
  description?: string
  display_order?: number
}): Promise<ProductArea> {
  return fetchApi<ProductArea>("/api/product-areas", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateProductArea(
  id: number,
  data: {
    name?: string
    description?: string
    display_order?: number
    is_active?: boolean
  }
): Promise<ProductArea> {
  return fetchApi<ProductArea>(`/api/product-areas/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteProductArea(id: number): Promise<void> {
  await fetchApi(`/api/product-areas/${id}`, { method: "DELETE" })
}

// Clustering
export interface PainTheme {
  id: number
  name: string
  description: string | null
  severity: number
  product_area_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  post_count: number
  product_area_name: string | null
}

export interface ClusteringRun {
  id: number
  started_at: string
  completed_at: string | null
  status: "running" | "completed" | "failed"
  run_type: "full" | "incremental"
  posts_processed: number
  themes_created: number
  themes_updated: number
  error_message: string | null
}

export interface HeatmapCell {
  theme_id: number
  theme_name: string
  severity: number
  post_count: number
  product_area_id: number | null
  product_area_name: string | null
}

export interface HeatmapRow {
  product_area_id: number | null
  product_area_name: string
  themes: HeatmapCell[]
  total_posts: number
}

export interface HeatmapResponse {
  rows: HeatmapRow[]
  total_themes: number
  total_posts: number
  last_clustering_run: ClusteringRun | null
}

export interface ThemePostSummary {
  id: string
  title: string
  author: string
  created_utc: string
  sentiment: "positive" | "neutral" | "negative" | null
  confidence: number
}

export interface ThemeDetail extends PainTheme {
  posts: ThemePostSummary[]
}

export async function triggerClusteringRun(
  runType: "full" | "incremental"
): Promise<ClusteringRun> {
  return fetchApi<ClusteringRun>("/api/clustering/run", {
    method: "POST",
    body: JSON.stringify({ run_type: runType }),
  })
}

export async function getClusteringStatus(): Promise<ClusteringRun | null> {
  return fetchApi<ClusteringRun | null>("/api/clustering/status")
}

export async function getThemes(params?: {
  product_area_id?: number
  include_inactive?: boolean
}): Promise<PainTheme[]> {
  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value))
    })
  }
  const query = searchParams.toString()
  return fetchApi<PainTheme[]>(`/api/clustering/themes${query ? `?${query}` : ""}`)
}

export async function getThemeDetail(themeId: number): Promise<ThemeDetail> {
  return fetchApi<ThemeDetail>(`/api/clustering/themes/${themeId}`)
}

export async function updateTheme(
  themeId: number,
  data: {
    name?: string
    description?: string
    severity?: number
    product_area_id?: number
    is_active?: boolean
  }
): Promise<PainTheme> {
  return fetchApi<PainTheme>(`/api/clustering/themes/${themeId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function getHeatmapData(): Promise<HeatmapResponse> {
  return fetchApi<HeatmapResponse>("/api/clustering/heatmap")
}
