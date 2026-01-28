"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { HeatmapResponse, HeatmapCell } from "@/lib/api"

interface PainHeatmapProps {
  data: HeatmapResponse
  onThemeClick?: (themeId: number) => void
}

function getSeverityColor(severity: number): string {
  switch (severity) {
    case 5:
      return "bg-red-500 hover:bg-red-600"
    case 4:
      return "bg-orange-500 hover:bg-orange-600"
    case 3:
      return "bg-yellow-500 hover:bg-yellow-600"
    case 2:
      return "bg-blue-400 hover:bg-blue-500"
    case 1:
      return "bg-green-400 hover:bg-green-500"
    default:
      return "bg-gray-400 hover:bg-gray-500"
  }
}

function getSeverityLabel(severity: number): string {
  switch (severity) {
    case 5:
      return "Critical"
    case 4:
      return "High"
    case 3:
      return "Medium"
    case 2:
      return "Low"
    case 1:
      return "Minor"
    default:
      return "Unknown"
  }
}

function ThemeCell({ cell, onClick }: { cell: HeatmapCell; onClick?: () => void }) {
  // Size based on post count (min 60px, max 120px)
  const size = Math.min(120, Math.max(60, 40 + cell.post_count * 8))

  return (
    <button
      onClick={onClick}
      className={`
        ${getSeverityColor(cell.severity)}
        rounded-lg p-2 text-white text-xs font-medium
        transition-all cursor-pointer
        flex flex-col items-center justify-center text-center
        shadow-sm hover:shadow-md
      `}
      style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px` }}
      title={`${cell.theme_name}: ${cell.post_count} posts (Severity: ${getSeverityLabel(cell.severity)})`}
    >
      <span className="truncate w-full">{cell.theme_name}</span>
      <span className="text-white/80 mt-1">{cell.post_count}</span>
    </button>
  )
}

export function PainHeatmap({ data, onThemeClick }: PainHeatmapProps) {
  const [expandedArea, setExpandedArea] = useState<number | null | undefined>(undefined)

  if (data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No pain themes discovered yet. Run clustering to analyze posts.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Severity:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-400" />
          <span>Minor</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-400" />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500" />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500" />
          <span>High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500" />
          <span>Critical</span>
        </div>
      </div>

      {/* Heatmap rows */}
      {data.rows.map((row) => (
        <Card key={row.product_area_id ?? "uncategorized"}>
          <CardHeader
            className="cursor-pointer"
            onClick={() =>
              setExpandedArea(
                expandedArea === row.product_area_id ? undefined : row.product_area_id
              )
            }
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {row.product_area_name}
                <Badge variant="secondary">{row.total_posts} posts</Badge>
              </CardTitle>
              <Badge variant="outline">{row.themes.length} themes</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {row.themes.map((cell) => (
                <ThemeCell
                  key={cell.theme_id}
                  cell={cell}
                  onClick={() => onThemeClick?.(cell.theme_id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Summary */}
      <div className="text-sm text-muted-foreground text-center">
        {data.total_themes} themes across {data.total_posts} posts
        {data.last_clustering_run && (
          <span>
            {" "}
            &bull; Last clustered:{" "}
            {new Date(data.last_clustering_run.completed_at!).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}
