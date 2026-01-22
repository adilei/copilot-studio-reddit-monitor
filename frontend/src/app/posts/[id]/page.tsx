"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SentimentBadge } from "@/components/SentimentBadge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getPost,
  updatePostStatus,
  analyzePost,
  type PostDetail,
  type Post,
} from "@/lib/api"
import { formatDate } from "@/lib/utils"
import {
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  Sparkles,
  CheckCircle,
} from "lucide-react"

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    loadPost()
  }, [params.id])

  async function loadPost() {
    try {
      const data = await getPost(params.id as string)
      setPost(data)
    } catch (error) {
      console.error("Failed to load post:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(status: Post["status"]) {
    if (!post) return
    try {
      await updatePostStatus(post.id, status)
      setPost({ ...post, status })
    } catch (error) {
      console.error("Failed to update status:", error)
    }
  }

  async function handleAnalyze() {
    if (!post) return
    setAnalyzing(true)
    try {
      const analysis = await analyzePost(post.id)
      setPost({
        ...post,
        status: "analyzed",
        latest_sentiment: analysis.sentiment,
        latest_sentiment_score: analysis.sentiment_score,
        analyses: [analysis, ...post.analyses],
      })
    } catch (error) {
      console.error("Failed to analyze post:", error)
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading post...</div>
  }

  if (!post) {
    return <div className="p-8 text-center">Post not found</div>
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Post content */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl">{post.title}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>r/{post.subreddit}</span>
                <span>·</span>
                <span>u/{post.author}</span>
                <span>·</span>
                <span>{formatDate(post.created_utc)}</span>
              </div>
            </div>
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              View on Reddit
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {post.body && (
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">{post.body}</p>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-4 w-4" />
              {post.score} points
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {post.num_comments} comments
            </span>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select value={post.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="handled">Handled</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sentiment:</span>
              <SentimentBadge
                sentiment={post.latest_sentiment}
                score={post.latest_sentiment_score}
                showScore
              />
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="outline">
              <Sparkles className="h-4 w-4 mr-2" />
              {analyzing ? "Analyzing..." : "Analyze"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analyses */}
      {post.analyses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Analysis History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {post.analyses.map((analysis) => (
              <div key={analysis.id} className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <SentimentBadge
                    sentiment={analysis.sentiment}
                    score={analysis.sentiment_score}
                    showScore
                  />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(analysis.analyzed_at)} · {analysis.model_used}
                  </span>
                </div>
                <p className="text-sm">{analysis.summary}</p>
                {analysis.key_issues && analysis.key_issues.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {analysis.key_issues.map((issue, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Contributor replies */}
      {post.contributor_replies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Microsoft Responses
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {post.contributor_replies.map((reply) => (
              <div key={reply.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div>
                  <span className="font-medium">{reply.contributor_name}</span>
                  <span className="text-muted-foreground ml-2">
                    (u/{reply.contributor_handle})
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDate(reply.replied_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
