"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getSentimentTrends,
  getSubredditStats,
  getContributorLeaderboard,
  getStatusBreakdown,
  type SentimentTrend,
} from "@/lib/api"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral: "#6b7280",
  negative: "#ef4444",
}

const STATUS_COLORS = {
  pending: "#eab308",
  analyzed: "#3b82f6",
  handled: "#22c55e",
  answered: "#a855f7",
}

export default function AnalyticsPage() {
  const [sentimentData, setSentimentData] = useState<SentimentTrend[]>([])
  const [subredditData, setSubredditData] = useState<{ subreddit: string; count: number }[]>([])
  const [leaderboard, setLeaderboard] = useState<{ name: string; reply_count: number }[]>([])
  const [statusData, setStatusData] = useState<{ status: string; count: number }[]>([])
  const [days, setDays] = useState("30")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [days])

  async function loadData() {
    setLoading(true)
    try {
      const [sentiment, subreddits, leaders, status] = await Promise.all([
        getSentimentTrends(parseInt(days)),
        getSubredditStats(),
        getContributorLeaderboard(),
        getStatusBreakdown(),
      ])
      setSentimentData(sentiment)
      setSubredditData(subreddits)
      setLeaderboard(leaders)
      setStatusData(status)
    } catch (error) {
      console.error("Failed to load analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading analytics...</div>
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Sentiment trends and engagement metrics
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sentiment trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {sentimentData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No sentiment data available. Analyze some posts first.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sentimentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="positive"
                  stroke={SENTIMENT_COLORS.positive}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="neutral"
                  stroke={SENTIMENT_COLORS.neutral}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  stroke={SENTIMENT_COLORS.negative}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Subreddit distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Posts by Subreddit</CardTitle>
          </CardHeader>
          <CardContent>
            {subredditData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No subreddit data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={subredditData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="subreddit" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No status data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    dataKey="count"
                    nameKey="status"
                  >
                    {statusData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] || "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contributor leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Top Contributors</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No contributor data available. Add contributors and let them reply to posts.
            </div>
          ) : (
            <div className="space-y-4">
              {leaderboard.map((contributor, index) => (
                <div
                  key={contributor.name}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="font-medium">{contributor.name}</span>
                  </div>
                  <span className="text-sm">
                    {contributor.reply_count} replies
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
