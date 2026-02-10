"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  createContributor,
  createReader,
  deleteContributor,
  type Contributor,
} from "@/lib/api"
import { useCanPerformActions } from "@/lib/permissions"
import { formatDate } from "@/lib/utils"
import { Plus, Trash2, User, Eye, BarChart3 } from "lucide-react"
import Link from "next/link"

interface ContributorListProps {
  contributors: Contributor[]
  readers?: Contributor[]
  onUpdate: () => void
}

export function ContributorList({ contributors, readers = [], onUpdate }: ContributorListProps) {
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()
  // Readers cannot manage users, even when auth is disabled
  const canManageUsers = canPerformActions
  const [showContributorForm, setShowContributorForm] = useState(false)
  const [showReaderForm, setShowReaderForm] = useState(false)
  const [newContributor, setNewContributor] = useState({
    name: "",
    reddit_handle: "",
    microsoft_alias: "",
    role: "",
  })
  const [newReader, setNewReader] = useState({
    name: "",
    microsoft_alias: "",
    role: "",
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmitContributor(e: React.FormEvent) {
    e.preventDefault()
    if (!newContributor.name || !newContributor.reddit_handle) return

    setSubmitting(true)
    try {
      await createContributor({
        name: newContributor.name,
        reddit_handle: newContributor.reddit_handle,
        microsoft_alias: newContributor.microsoft_alias || undefined,
        role: newContributor.role || undefined,
      })
      setNewContributor({ name: "", reddit_handle: "", microsoft_alias: "", role: "" })
      setShowContributorForm(false)
      onUpdate()
    } catch (error) {
      console.error("Failed to create contributor:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitReader(e: React.FormEvent) {
    e.preventDefault()
    if (!newReader.name || !newReader.microsoft_alias) return

    setSubmitting(true)
    try {
      await createReader({
        name: newReader.name,
        microsoft_alias: newReader.microsoft_alias,
        role: newReader.role || undefined,
      })
      setNewReader({ name: "", microsoft_alias: "", role: "" })
      setShowReaderForm(false)
      onUpdate()
    } catch (error) {
      console.error("Failed to create reader:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number, isReader: boolean) {
    const userType = isReader ? "reader" : "contributor"
    if (!confirm(`Are you sure you want to deactivate this ${userType}?`)) return
    try {
      await deleteContributor(id)
      onUpdate()
    } catch (error) {
      console.error(`Failed to delete ${userType}:`, error)
    }
  }

  return (
    <div className="space-y-8">
      {/* Contributors section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Microsoft Contributors</h2>
          {canManageUsers ? (
            <Button onClick={() => setShowContributorForm(!showContributorForm)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Contributor
            </Button>
          ) : (
            <Button variant="outline" disabled title={permissionReason ?? undefined}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contributor
            </Button>
          )}
        </div>

        {showContributorForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add New Contributor</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitContributor} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    placeholder="Name"
                    value={newContributor.name}
                    onChange={(e) =>
                      setNewContributor((c) => ({ ...c, name: e.target.value }))
                    }
                    required
                  />
                  <Input
                    placeholder="Reddit Handle (without u/)"
                    value={newContributor.reddit_handle}
                    onChange={(e) =>
                      setNewContributor((c) => ({ ...c, reddit_handle: e.target.value }))
                    }
                    required
                  />
                  <Input
                    placeholder="Microsoft Alias (optional, e.g., johndoe)"
                    value={newContributor.microsoft_alias}
                    onChange={(e) =>
                      setNewContributor((c) => ({ ...c, microsoft_alias: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Role (optional)"
                    value={newContributor.role}
                    onChange={(e) =>
                      setNewContributor((c) => ({ ...c, role: e.target.value }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Adding..." : "Add Contributor"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowContributorForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {contributors.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No contributors added yet. Add Microsoft team members to track their
              Reddit responses.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contributors.map((contributor) => (
              <Card key={contributor.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <Link
                          href={`/contributors/detail?id=${contributor.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {contributor.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          u/{contributor.reddit_handle}
                        </p>
                      </div>
                    </div>
                    {canManageUsers && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(contributor.id, false)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {contributor.role && (
                        <Badge variant="secondary">{contributor.role}</Badge>
                      )}
                      <Badge variant="outline">{contributor.reply_count} replies</Badge>
                    </div>
                    <Link
                      href={`/contributors/detail?id=${contributor.id}`}
                      className="text-muted-foreground hover:text-primary"
                      title="View activity"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Added {formatDate(contributor.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Readers section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Readers</h2>
            <p className="text-sm text-muted-foreground">
              View-only users who can access the dashboard but cannot perform actions
            </p>
          </div>
          {canManageUsers ? (
            <Button onClick={() => setShowReaderForm(!showReaderForm)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Reader
            </Button>
          ) : (
            <Button variant="outline" disabled title={permissionReason ?? undefined}>
              <Plus className="h-4 w-4 mr-2" />
              Add Reader
            </Button>
          )}
        </div>

        {showReaderForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add New Reader</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitReader} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Input
                    placeholder="Name"
                    value={newReader.name}
                    onChange={(e) =>
                      setNewReader((c) => ({ ...c, name: e.target.value }))
                    }
                    required
                  />
                  <Input
                    placeholder="Microsoft Alias (e.g., johndoe)"
                    value={newReader.microsoft_alias}
                    onChange={(e) =>
                      setNewReader((c) => ({ ...c, microsoft_alias: e.target.value }))
                    }
                    required
                  />
                  <Input
                    placeholder="Role (optional)"
                    value={newReader.role}
                    onChange={(e) =>
                      setNewReader((c) => ({ ...c, role: e.target.value }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Adding..." : "Add Reader"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowReaderForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {readers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No readers added yet. Readers can view all content but cannot perform actions.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {readers.map((reader) => (
              <Card key={reader.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Eye className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{reader.name}</span>
                          <Badge variant="secondary" className="text-xs">Reader</Badge>
                        </div>
                        {reader.microsoft_alias && (
                          <p className="text-sm text-muted-foreground">
                            {reader.microsoft_alias}@microsoft.com
                          </p>
                        )}
                      </div>
                    </div>
                    {canManageUsers && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(reader.id, true)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {reader.role && (
                      <Badge variant="secondary">{reader.role}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Added {formatDate(reader.created_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
