"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SentimentBadge } from "@/components/SentimentBadge"
import { formatRelativeTime } from "@/lib/utils"
import { ExternalLink, MessageSquare, ThumbsUp, CheckCircle } from "lucide-react"
import type { Post } from "@/lib/api"
import Link from "next/link"

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    analyzed: "bg-blue-100 text-blue-800",
    handled: "bg-green-100 text-green-800",
    answered: "bg-purple-100 text-purple-800",
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Link href={`/posts/${post.id}`}>
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
            />
            <Badge className={statusColors[post.status]}>
              {post.status}
            </Badge>
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
      </CardContent>
    </Card>
  )
}
