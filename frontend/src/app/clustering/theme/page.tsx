"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SentimentBadge } from "@/components/SentimentBadge"
import {
  getThemeDetail,
  updateTheme,
  type ThemeDetail,
} from "@/lib/api"
import { formatDate, formatRelativeTime } from "@/lib/utils"
import { ArrowLeft, Edit, Save, X } from "lucide-react"
import { useCanPerformActions } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

function getSeverityColor(severity: number): string {
  switch (severity) {
    case 5:
      return "bg-red-100 text-red-800"
    case 4:
      return "bg-orange-100 text-orange-800"
    case 3:
      return "bg-yellow-100 text-yellow-800"
    case 2:
      return "bg-blue-100 text-blue-800"
    case 1:
      return "bg-green-100 text-green-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

export default function ThemeDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading theme...</div>}>
      <ThemeDetailContent />
    </Suspense>
  )
}

function ThemeDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get("id")
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()

  const [theme, setTheme] = useState<ThemeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    severity: 3,
  })

  useEffect(() => {
    if (id) {
      loadData()
    } else {
      setLoading(false)
    }
  }, [id])

  async function loadData() {
    if (!id) return
    try {
      const themeData = await getThemeDetail(parseInt(id))
      setTheme(themeData)
      setEditForm({
        name: themeData.name,
        description: themeData.description || "",
        severity: themeData.severity,
      })
    } catch (error) {
      console.error("Failed to load theme:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!theme) return
    setSaving(true)
    try {
      const updated = await updateTheme(theme.id, {
        name: editForm.name,
        description: editForm.description || undefined,
        severity: editForm.severity,
      })
      setTheme({
        ...theme,
        name: updated.name,
        description: updated.description,
        severity: updated.severity,
      })
      setEditing(false)
    } catch (error) {
      console.error("Failed to update theme:", error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading theme...</div>
  }

  if (!theme) {
    return <div className="p-8 text-center">Theme not found</div>
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push("/clustering")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clustering
        </Button>
      </div>

      {/* Theme details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              {editing ? (
                <Input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="text-xl font-bold"
                />
              ) : (
                <CardTitle className="text-xl">{theme.name}</CardTitle>
              )}

              <div className="flex items-center gap-2">
                {editing ? (
                  <Select
                    value={editForm.severity.toString()}
                    onValueChange={(val) =>
                      setEditForm({ ...editForm, severity: parseInt(val) })
                    }
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Minor (1)</SelectItem>
                      <SelectItem value="2">Low (2)</SelectItem>
                      <SelectItem value="3">Medium (3)</SelectItem>
                      <SelectItem value="4">High (4)</SelectItem>
                      <SelectItem value="5">Critical (5)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={getSeverityColor(theme.severity)}>
                    {getSeverityLabel(theme.severity)}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  disabled={!canPerformActions}
                  title={!canPerformActions ? permissionReason ?? undefined : undefined}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <textarea
              value={editForm.description}
              onChange={(e) =>
                setEditForm({ ...editForm, description: e.target.value })
              }
              className="w-full p-2 border rounded-md text-sm"
              rows={3}
              placeholder="Theme description..."
            />
          ) : (
            theme.description && (
              <p className="text-muted-foreground">{theme.description}</p>
            )
          )}

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{theme.post_count} posts</span>
            <span>Created: {formatDate(theme.created_at)}</span>
          </div>

          {/* Product Area Tags - derived from posts */}
          {theme.product_area_tags && theme.product_area_tags.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">Product areas (from posts)</p>
              <div className="flex flex-wrap gap-2">
                {theme.product_area_tags.map((tag) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                    <span className="ml-1 text-muted-foreground">({tag.post_count})</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Posts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Posts ({theme.posts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {theme.posts.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No posts assigned to this theme yet.
            </p>
          ) : (
            <div className="space-y-2">
              {theme.posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/detail?id=${post.id}`}
                  className="block p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{post.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <span>u/{post.author}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(post.created_utc)}</span>
                        {post.product_area_name && (
                          <>
                            <span>·</span>
                            <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                              {post.product_area_name}
                            </span>
                          </>
                        )}
                        {post.confidence < 1 && (
                          <>
                            <span>·</span>
                            <span>
                              {Math.round(post.confidence * 100)}% confidence
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <SentimentBadge sentiment={post.sentiment} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
