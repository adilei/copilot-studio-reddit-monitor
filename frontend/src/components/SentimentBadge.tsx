"use client"

import { Badge } from "@/components/ui/badge"
import { Flame } from "lucide-react"

interface SentimentBadgeProps {
  sentiment: "positive" | "neutral" | "negative" | null
  score?: number | null
  showScore?: boolean
  isWarning?: boolean
}

export function SentimentBadge({ sentiment, score, showScore = false, isWarning = false }: SentimentBadgeProps) {
  if (!sentiment) {
    return <Badge variant="outline">Not analyzed</Badge>
  }

  const variant = sentiment === "positive" ? "positive" :
                  sentiment === "negative" ? "negative" : "neutral"

  const label = sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
  const scoreDisplay = showScore && score != null ? ` (${score.toFixed(2)})` : ""

  return (
    <div className="flex items-center gap-1.5">
      {isWarning && (
        <Badge variant="warning" className="px-1.5 flex items-center gap-1">
          <Flame className="h-3 w-3" />
        </Badge>
      )}
      <Badge variant={variant}>
        {label}{scoreDisplay}
      </Badge>
    </div>
  )
}
