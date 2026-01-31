"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getContributors,
  getContributorActivity,
  type Contributor,
  type ContributorActivity,
} from "@/lib/api"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { ArrowLeft, MessageSquare, Calendar, TrendingUp } from "lucide-react"
import Link from "next/link"
import { formatRelativeTime } from "@/lib/utils"

export default function ContributorDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <ContributorDetailContent />
    </Suspense>
  )
}

function ContributorDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const contributorId = searchParams.get("id")

  const [contributors, setContributors] = useState<Contributor[]>([])
  const [selectedId, setSelectedId] = useState<string>(contributorId || "")
  const [activity, setActivity] = useState<ContributorActivity | null>(null)
  const [days, setDays] = useState("90")
  const [loading, setLoading] = useState(true)

  // Load contributors list for dropdown
  useEffect(() => {
    async function loadContributors() {
      try {
        const data = await getContributors()
        setContributors(data)
      } catch (error) {
        console.error("Failed to load contributors:", error)
      }
    }
    loadContributors()
  }, [])

  // Load activity when contributor or days changes
  useEffect(() => {
    if (!selectedId) {
      setLoading(false)
      return
    }

    async function loadActivity() {
      setLoading(true)
      try {
        const data = await getContributorActivity(parseInt(selectedId), parseInt(days))
        setActivity(data)
      } catch (error) {
        console.error("Failed to load activity:", error)
        setActivity(null)
      } finally {
        setLoading(false)
      }
    }
    loadActivity()
  }, [selectedId, days])

  function handleContributorChange(value: string) {
    setSelectedId(value)
    router.push(`/contributors/detail?id=${value}`)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/contributors")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contributor Activity</h1>
          <p className="text-muted-foreground">
            Response history and engagement metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedId} onValueChange={handleContributorChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select contributor" />
            </SelectTrigger>
            <SelectContent>
              {contributors.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a contributor to view their activity
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="text-center py-12">Loading activity...</div>
      ) : !activity ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Could not load activity data
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Today</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity.summary.replies_today}</div>
                <p className="text-xs text-muted-foreground">replies</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Week</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity.summary.replies_week}</div>
                <p className="text-xs text-muted-foreground">replies</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity.summary.replies_month}</div>
                <p className="text-xs text-muted-foreground">replies</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">All Time</CardTitle>
                <MessageSquare className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity.summary.replies_total}</div>
                <p className="text-xs text-muted-foreground">total replies</p>
              </CardContent>
            </Card>
          </div>

          {/* Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Reply Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.activity.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No activity in this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={activity.activity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value)
                        return `${date.getMonth() + 1}/${date.getDate()}`
                      }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      formatter={(value: number) => [value, "Replies"]}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Recent Posts */}
          {activity.recent_posts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Responses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activity.recent_posts.map((post) => (
                    <Link
                      key={post.post_id}
                      href={`/posts/detail?id=${post.post_id}`}
                      className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <p className="font-medium line-clamp-1">{post.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Replied {formatRelativeTime(post.replied_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
