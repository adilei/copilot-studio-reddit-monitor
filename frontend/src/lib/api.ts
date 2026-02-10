import { getTokenGetter } from "./token-store"

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
  resolved: boolean
  resolved_at: string | null
  resolved_by: number | null
  resolved_by_name: string | null
  product_area_id: number | null
  product_area_name: string | null
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
  reddit_handle: string | null  // Nullable for readers
  microsoft_alias?: string | null
  role: string | null
  active: boolean
  created_at: string
  reply_count: number
  user_type: "contributor" | "reader"
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
  handled_count: number
  warning_count: number
  in_progress_count: number
  awaiting_pickup_count: number
  unhandled_negative_count: number
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
  // Get auth token if available
  const tokenGetter = getTokenGetter()
  const token = tokenGetter ? await tokenGetter() : null

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  }

  // Add Authorization header if we have a token
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

// Like fetchApi but returns null on 401/403 instead of throwing.
// Used for notification polling so it keeps working when tokens expire.
async function fetchApiSoft<T>(
  endpoint: string,
  fallback: T,
  options?: RequestInit
): Promise<T> {
  try {
    return await fetchApi<T>(endpoint, options)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("401") || msg.includes("403")) {
      return fallback
    }
    throw e
  }
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
  resolved?: boolean
  status?: "waiting_for_pickup" | "in_progress" | "handled"
  clustered?: boolean
  product_area_ids?: number[]
}): Promise<Post[]> {
  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        // Handle arrays (like product_area_ids) by appending each value
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(key, String(v)))
        } else {
          searchParams.append(key, String(value))
        }
      }
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

export async function resolvePost(
  id: string,
  contributorId: number
): Promise<Post> {
  return fetchApi<Post>(`/api/posts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ contributor_id: contributorId }),
  })
}

export async function unresolvePost(
  id: string,
  contributorId: number
): Promise<Post> {
  return fetchApi<Post>(`/api/posts/${id}/unresolve`, {
    method: "POST",
    body: JSON.stringify({ contributor_id: contributorId }),
  })
}

// Contributors
export async function getContributors(
  includeInactive?: boolean,
  includeReaders?: boolean
): Promise<Contributor[]> {
  const params = new URLSearchParams()
  if (includeInactive) params.set("include_inactive", "true")
  if (includeReaders) params.set("include_readers", "true")
  const query = params.toString() ? `?${params.toString()}` : ""
  return fetchApi<Contributor[]>(`/api/contributors${query}`)
}

export async function createContributor(data: {
  name: string
  reddit_handle: string
  microsoft_alias?: string
  role?: string
}): Promise<Contributor> {
  return fetchApi<Contributor>("/api/contributors", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function createReader(data: {
  name: string
  microsoft_alias: string
  role?: string
}): Promise<Contributor> {
  return fetchApi<Contributor>("/api/contributors/readers", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function deleteContributor(id: number): Promise<void> {
  await fetchApi(`/api/contributors/${id}`, { method: "DELETE" })
}

export interface ContributorActivity {
  contributor: {
    id: number
    name: string
    reddit_handle: string
  }
  activity: { date: string; count: number }[]
  summary: {
    replies_today: number
    replies_week: number
    replies_month: number
    replies_total: number
  }
  recent_posts: {
    post_id: string
    title: string
    replied_at: string
  }[]
}

export async function getContributorActivity(
  id: number,
  days?: number
): Promise<ContributorActivity> {
  const query = days ? `?days=${days}` : ""
  return fetchApi<ContributorActivity>(`/api/contributors/${id}/activity${query}`)
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

export async function getWarningPosts(limit?: number, excludeHandled?: boolean): Promise<WarningPost[]> {
  const params = new URLSearchParams()
  if (limit) params.set("limit", limit.toString())
  if (excludeHandled) params.set("exclude_handled", "true")
  const query = params.toString() ? `?${params.toString()}` : ""
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
export interface ProductAreaTag {
  id: number
  name: string
  post_count: number
}

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
  product_area_tags: ProductAreaTag[]
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
  unclustered_count: number
  last_clustering_run: ClusteringRun | null
}

export interface ThemePostSummary {
  id: string
  title: string
  author: string
  created_utc: string
  sentiment: "positive" | "neutral" | "negative" | null
  confidence: number
  product_area_id: number | null
  product_area_name: string | null
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
  product_area_ids?: number[]
  include_inactive?: boolean
}): Promise<PainTheme[]> {
  const searchParams = new URLSearchParams()
  if (params) {
    if (params.product_area_ids && params.product_area_ids.length > 0) {
      // FastAPI expects repeated params for list: ?product_area_ids=1&product_area_ids=2
      params.product_area_ids.forEach((id) => {
        searchParams.append("product_area_ids", String(id))
      })
    }
    if (params.include_inactive !== undefined) {
      searchParams.append("include_inactive", String(params.include_inactive))
    }
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

// Notifications
export interface NotificationItem {
  id: number
  notification_type: string
  title: string
  body: string
  post_id: string
  theme_id: number | null
  product_area_name: string | null
  read: boolean
  created_at: string
}

export interface NotificationPreferences {
  boiling_enabled: boolean
  negative_enabled: boolean
  product_areas: number[]
  push_enabled: boolean
}

export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export async function getNotifications(params?: {
  contributor_id?: number
  skip?: number
  limit?: number
  unread_only?: boolean
}): Promise<NotificationItem[]> {
  const searchParams = new URLSearchParams()
  if (params?.contributor_id !== undefined) searchParams.set("contributor_id", String(params.contributor_id))
  if (params?.skip !== undefined) searchParams.set("skip", String(params.skip))
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit))
  if (params?.unread_only !== undefined) searchParams.set("unread_only", String(params.unread_only))
  const query = searchParams.toString()
  return fetchApiSoft(`/api/notifications${query ? `?${query}` : ""}`, [] as NotificationItem[])
}

export async function getUnreadCount(contributorId: number): Promise<{ unread_count: number }> {
  return fetchApiSoft(`/api/notifications/unread-count?contributor_id=${contributorId}`, { unread_count: 0 })
}

export async function markNotificationRead(id: number, contributorId: number): Promise<void> {
  await fetchApi(`/api/notifications/${id}/read?contributor_id=${contributorId}`, { method: "POST" })
}

export async function markAllNotificationsRead(contributorId: number): Promise<void> {
  await fetchApi(`/api/notifications/read-all?contributor_id=${contributorId}`, { method: "POST" })
}

export async function getNotificationPreferences(contributorId: number): Promise<NotificationPreferences> {
  return fetchApi<NotificationPreferences>(`/api/notifications/preferences?contributor_id=${contributorId}`)
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
  contributorId: number
): Promise<NotificationPreferences> {
  return fetchApi<NotificationPreferences>(`/api/notifications/preferences?contributor_id=${contributorId}`, {
    method: "PUT",
    body: JSON.stringify(prefs),
  })
}

export async function subscribeToPush(subscription: PushSubscriptionData, contributorId: number): Promise<void> {
  await fetchApi(`/api/notifications/push/subscribe?contributor_id=${contributorId}`, {
    method: "POST",
    body: JSON.stringify(subscription),
  })
}

export async function unsubscribeFromPush(endpoint: string, contributorId: number): Promise<void> {
  await fetchApi(`/api/notifications/push/unsubscribe?contributor_id=${contributorId}`, {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  })
}

export async function getVapidPublicKey(): Promise<{ vapid_public_key: string }> {
  return fetchApi<{ vapid_public_key: string }>("/api/notifications/push/vapid-key")
}
