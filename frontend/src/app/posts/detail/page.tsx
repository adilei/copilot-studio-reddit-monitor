"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SentimentBadge } from "@/components/SentimentBadge"
import {
  getPost,
  analyzePost,
  checkoutPost,
  releasePost,
  resolvePost,
  unresolvePost,
  type PostDetail,
} from "@/lib/api"
import { useContributor } from "@/lib/contributor-context"
import { useCanPerformActions } from "@/lib/permissions"
import { formatDate, formatRelativeTime } from "@/lib/utils"
import {
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  Sparkles,
  CheckCircle,
  CheckCircle2,
  CircleDashed,
  Lock,
  Unlock,
  UserCheck,
} from "lucide-react"

export default function PostDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading post...</div>}>
      <PostDetailContent />
    </Suspense>
  )
}

function PostDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = searchParams.get("id")
  const { contributor } = useContributor()
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()

  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [resolving, setResolving] = useState(false)

  const isCheckedOutByMe =
    contributor && post?.checked_out_by === contributor.id
  const isCheckedOutByOther =
    post?.checked_out_by && (!contributor || post.checked_out_by !== contributor.id)

  useEffect(() => {
    if (id) {
      loadPost()
    } else {
      setLoading(false)
    }
  }, [id])

  async function loadPost() {
    if (!id) return
    try {
      const data = await getPost(id)
      setPost(data)
    } catch (error) {
      console.error("Failed to load post:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleAnalyze() {
    if (!post) return
    setAnalyzing(true)
    try {
      const analysis = await analyzePost(post.id)
      setPost({
        ...post,
        is_analyzed: true,
        latest_sentiment: analysis.sentiment,
        latest_sentiment_score: analysis.sentiment_score,
        is_warning: analysis.is_warning,
        analyses: [analysis, ...post.analyses],
      })
    } catch (error) {
      console.error("Failed to analyze post:", error)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleCheckout() {
    if (!post || !contributor) return
    setCheckingOut(true)
    try {
      const updated = await checkoutPost(post.id, contributor.id)
      setPost({
        ...post,
        checked_out_by: updated.checked_out_by,
        checked_out_by_name: updated.checked_out_by_name,
        checked_out_at: updated.checked_out_at,
      })
    } catch (error) {
      console.error("Failed to checkout post:", error)
    } finally {
      setCheckingOut(false)
    }
  }

  async function handleRelease() {
    if (!post || !contributor) return
    setCheckingOut(true)
    try {
      await releasePost(post.id, contributor.id)
      setPost({
        ...post,
        checked_out_by: null,
        checked_out_by_name: null,
        checked_out_at: null,
      })
    } catch (error) {
      console.error("Failed to release post:", error)
    } finally {
      setCheckingOut(false)
    }
  }

  async function handleResolve() {
    if (!post || !contributor) return
    setResolving(true)
    try {
      const updated = await resolvePost(post.id, contributor.id)
      setPost({
        ...post,
        resolved: updated.resolved,
        resolved_at: updated.resolved_at,
        resolved_by: updated.resolved_by,
        resolved_by_name: updated.resolved_by_name,
      })
    } catch (error) {
      console.error("Failed to resolve post:", error)
    } finally {
      setResolving(false)
    }
  }

  async function handleUnresolve() {
    if (!post || !contributor) return
    setResolving(true)
    try {
      await unresolvePost(post.id, contributor.id)
      setPost({
        ...post,
        resolved: false,
        resolved_at: null,
        resolved_by: null,
        resolved_by_name: null,
      })
    } catch (error) {
      console.error("Failed to unresolve post:", error)
    } finally {
      setResolving(false)
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

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Analysis:</span>
              {post.is_analyzed ? (
                <Badge className="bg-blue-100 text-blue-800">Analyzed</Badge>
              ) : (
                <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                  Not Analyzed
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sentiment:</span>
              <SentimentBadge
                sentiment={post.latest_sentiment}
                score={post.latest_sentiment_score}
                showScore
                isWarning={post.is_warning}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">MS Reply:</span>
              {post.has_contributor_reply ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline">No</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              {post.resolved ? (
                <Badge className="bg-purple-100 text-purple-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Done
                </Badge>
              ) : (
                <Badge variant="outline">
                  <CircleDashed className="h-3 w-3 mr-1" />
                  Open
                </Badge>
              )}
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || !canPerformActions}
              variant="outline"
              title={!canPerformActions ? permissionReason ?? undefined : undefined}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {analyzing ? "Analyzing..." : post.is_analyzed ? "Re-analyze" : "Analyze"}
            </Button>
          </div>

          {/* Checkout section */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
            {isCheckedOutByMe && (
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500 text-white">
                  <UserCheck className="h-3 w-3 mr-1" />
                  You're handling this
                </Badge>
                {post.checked_out_at && (
                  <span className="text-xs text-muted-foreground">
                    since {formatRelativeTime(post.checked_out_at)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRelease}
                  disabled={checkingOut || !canPerformActions}
                  title={!canPerformActions ? permissionReason ?? undefined : undefined}
                >
                  <Unlock className="h-4 w-4 mr-1" />
                  Release
                </Button>
              </div>
            )}
            {isCheckedOutByOther && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  <Lock className="h-3 w-3 mr-1" />
                  Checked out by {post.checked_out_by_name}
                </Badge>
                {post.checked_out_at && (
                  <span className="text-xs text-muted-foreground">
                    since {formatRelativeTime(post.checked_out_at)}
                  </span>
                )}
              </div>
            )}
            {!post.checked_out_by && canPerformActions && contributor && (
              <Button
                variant="outline"
                onClick={handleCheckout}
                disabled={checkingOut}
              >
                <Lock className="h-4 w-4 mr-1" />
                Checkout to handle
              </Button>
            )}
            {!post.checked_out_by && !canPerformActions && (
              <div className="text-sm text-muted-foreground">
                {permissionReason || "Select a contributor in the sidebar to checkout this post"}
              </div>
            )}
          </div>

          {/* Resolution section */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
            <span className="text-sm font-medium">Resolution:</span>
            {post.resolved ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-100 text-purple-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Marked done by {post.resolved_by_name}
                </Badge>
                {post.resolved_at && (
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(post.resolved_at)}
                  </span>
                )}
                {canPerformActions && contributor && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUnresolve}
                    disabled={resolving}
                  >
                    <CircleDashed className="h-4 w-4 mr-1" />
                    Reopen
                  </Button>
                )}
              </div>
            ) : (
              <>
                {canPerformActions && contributor ? (
                  <Button
                    variant="outline"
                    onClick={handleResolve}
                    disabled={resolving}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {resolving ? "Marking..." : "Mark as Done"}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {permissionReason || "Select a contributor to mark this post as done"}
                  </span>
                )}
              </>
            )}
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
                    isWarning={analysis.is_warning}
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
