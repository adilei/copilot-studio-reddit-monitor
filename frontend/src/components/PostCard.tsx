"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SentimentBadge } from "@/components/SentimentBadge"
import { formatRelativeTime } from "@/lib/utils"
import {
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  CheckCircle,
  UserCheck,
  Lock,
  Unlock,
  Sparkles,
} from "lucide-react"
import { checkoutPost, releasePost, type Post } from "@/lib/api"
import { useContributor } from "@/lib/contributor-context"
import Link from "next/link"

interface PostCardProps {
  post: Post
  onPostUpdate?: (post: Post) => void
}

export function PostCard({ post, onPostUpdate }: PostCardProps) {
  const { contributor } = useContributor()
  const [loading, setLoading] = useState(false)

  const isCheckedOutByMe =
    contributor && post.checked_out_by === contributor.id
  const isCheckedOutByOther =
    post.checked_out_by && (!contributor || post.checked_out_by !== contributor.id)

  async function handleCheckout() {
    if (!contributor) return
    setLoading(true)
    try {
      const updated = await checkoutPost(post.id, contributor.id)
      onPostUpdate?.(updated)
    } catch (error) {
      console.error("Failed to checkout post:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRelease() {
    if (!contributor) return
    setLoading(true)
    try {
      const updated = await releasePost(post.id, contributor.id)
      onPostUpdate?.(updated)
    } catch (error) {
      console.error("Failed to release post:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link href={`/posts/detail?id=${post.id}`}>
              <CardTitle className="text-base font-medium hover:text-primary cursor-pointer line-clamp-2">
                {post.title}
              </CardTitle>
            </Link>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>r/{post.subreddit}</span>
              <span>·</span>
              <span>u/{post.author}</span>
              <span>·</span>
              <span>{formatRelativeTime(post.created_utc)}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SentimentBadge
              sentiment={post.latest_sentiment}
              score={post.latest_sentiment_score}
              isWarning={post.is_warning}
            />
            {!post.is_analyzed && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                <Sparkles className="h-3 w-3 mr-1" />
                Not Analyzed
              </Badge>
            )}
            {isCheckedOutByMe && (
              <Badge className="bg-blue-500 text-white">
                <UserCheck className="h-3 w-3 mr-1" />
                You're handling
              </Badge>
            )}
            {isCheckedOutByOther && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                <Lock className="h-3 w-3 mr-1" />
                {post.checked_out_by_name}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {post.body && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {post.body}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-4 w-4" />
              {post.score}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {post.num_comments}
            </span>
            {post.has_contributor_reply && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                MS Reply
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {contributor && !post.checked_out_by && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCheckout}
                disabled={loading}
              >
                <Lock className="h-3 w-3 mr-1" />
                Checkout
              </Button>
            )}
            {isCheckedOutByMe && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRelease}
                disabled={loading}
              >
                <Unlock className="h-3 w-3 mr-1" />
                Release
              </Button>
            )}
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View on Reddit
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
