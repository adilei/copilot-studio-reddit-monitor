"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  createContributor,
  deleteContributor,
  type Contributor,
} from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { Plus, Trash2, User } from "lucide-react"

interface ContributorListProps {
  contributors: Contributor[]
  onUpdate: () => void
}

export function ContributorList({ contributors, onUpdate }: ContributorListProps) {
  const [showForm, setShowForm] = useState(false)
  const [newContributor, setNewContributor] = useState({
    name: "",
    reddit_handle: "",
    role: "",
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newContributor.name || !newContributor.reddit_handle) return

    setSubmitting(true)
    try {
      await createContributor({
        name: newContributor.name,
        reddit_handle: newContributor.reddit_handle,
        role: newContributor.role || undefined,
      })
      setNewContributor({ name: "", reddit_handle: "", role: "" })
      setShowForm(false)
      onUpdate()
    } catch (error) {
      console.error("Failed to create contributor:", error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to deactivate this contributor?")) return
    try {
      await deleteContributor(id)
      onUpdate()
    } catch (error) {
      console.error("Failed to delete contributor:", error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Microsoft Contributors</h2>
        <Button onClick={() => setShowForm(!showForm)} variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Contributor
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add New Contributor</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
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
                  onClick={() => setShowForm(false)}
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
                      <p className="font-medium">{contributor.name}</p>
                      <p className="text-sm text-muted-foreground">
                        u/{contributor.reddit_handle}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(contributor.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {contributor.role && (
                    <Badge variant="secondary">{contributor.role}</Badge>
                  )}
                  <Badge variant="outline">{contributor.reply_count} replies</Badge>
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
  )
}
