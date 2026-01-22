"use client"

import { Badge } from "@/components/ui/badge"

interface SentimentBadgeProps {
  sentiment: "positive" | "neutral" | "negative" | null
  score?: number | null
  showScore?: boolean
}

export function SentimentBadge({ sentiment, score, showScore = false }: SentimentBadgeProps) {
  if (!sentiment) {
    return <Badge variant="outline">Not analyzed</Badge>
  }

  const variant = sentiment === "positive" ? "positive" :
                  sentiment === "negative" ? "negative" : "neutral"

  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
  const scoreDisplay = showScore && score !== null ? ` (${score.toFixed(2)})` : ""

  return (
    <Badge variant={variant}>
      {label}{scoreDisplay}
    </Badge>
  )
}
