"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  getProductAreas,
  createProductArea,
  updateProductArea,
  deleteProductArea,
  type ProductArea,
} from "@/lib/api"
import { Plus, Edit, Trash2, Save, X, GripVertical } from "lucide-react"
import { useCanPerformActions } from "@/lib/permissions"

export default function ProductAreasPage() {
  const { canPerformActions, reason: permissionReason } = useCanPerformActions()
  const [productAreas, setProductAreas] = useState<ProductArea[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    display_order: 0,
  })

  const [newForm, setNewForm] = useState({
    name: "",
    description: "",
  })

  useEffect(() => {
    loadProductAreas()
  }, [])

  async function loadProductAreas() {
    try {
      const data = await getProductAreas(true) // Include inactive
      setProductAreas(data)
    } catch (error) {
      console.error("Failed to load product areas:", error)
    } finally {
      setLoading(false)
    }
  }

  function startEditing(pa: ProductArea) {
    setEditingId(pa.id)
    setEditForm({
      name: pa.name,
      description: pa.description || "",
      display_order: pa.display_order,
    })
  }

  async function handleSave(id: number) {
    setSaving(true)
    try {
      await updateProductArea(id, editForm)
      await loadProductAreas()
      setEditingId(null)
    } catch (error) {
      console.error("Failed to update product area:", error)
      alert("Failed to update product area")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreate() {
    if (!newForm.name.trim()) {
      alert("Name is required")
      return
    }
    setSaving(true)
    try {
      await createProductArea({
        name: newForm.name,
        description: newForm.description || undefined,
        display_order: productAreas.length + 1,
      })
      await loadProductAreas()
      setCreating(false)
      setNewForm({ name: "", description: "" })
    } catch (error) {
      console.error("Failed to create product area:", error)
      alert("Failed to create product area")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to deactivate this product area?")) {
      return
    }
    try {
      await deleteProductArea(id)
      await loadProductAreas()
    } catch (error) {
      console.error("Failed to delete product area:", error)
    }
  }

  async function handleToggleActive(pa: ProductArea) {
    try {
      await updateProductArea(pa.id, { is_active: !pa.is_active })
      await loadProductAreas()
    } catch (error) {
      console.error("Failed to toggle product area:", error)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading product areas...</div>
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product Areas</h1>
          <p className="text-muted-foreground">
            Manage product areas for categorizing pain themes
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          disabled={creating || !canPerformActions}
          title={!canPerformActions ? permissionReason ?? undefined : undefined}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product Area
        </Button>
      </div>

      {/* Create new form */}
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New Product Area</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newForm.name}
                onChange={(e) =>
                  setNewForm({ ...newForm, name: e.target.value })
                }
                placeholder="e.g., Authentication / Security"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newForm.description}
                onChange={(e) =>
                  setNewForm({ ...newForm, description: e.target.value })
                }
                placeholder="Brief description of this product area"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCreate}
                disabled={saving || !canPerformActions}
                title={!canPerformActions ? permissionReason ?? undefined : undefined}
              >
                <Save className="h-4 w-4 mr-1" />
                {saving ? "Creating..." : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreating(false)
                  setNewForm({ name: "", description: "" })
                }}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product areas list */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {productAreas.map((pa) => (
              <div
                key={pa.id}
                className={`p-4 flex items-center gap-4 ${
                  !pa.is_active ? "bg-muted/50" : ""
                }`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />

                {editingId === pa.id ? (
                  <div className="flex-1 space-y-2">
                    <Input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                    />
                    <Input
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                      placeholder="Description"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(pa.id)}
                        disabled={saving}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{pa.name}</span>
                        {!pa.is_active && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                        <Badge variant="secondary">
                          {pa.theme_count} themes
                        </Badge>
                      </div>
                      {pa.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {pa.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditing(pa)}
                        disabled={!canPerformActions}
                        title={!canPerformActions ? permissionReason ?? undefined : undefined}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {pa.is_active ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(pa.id)}
                          disabled={!canPerformActions}
                          title={!canPerformActions ? permissionReason ?? undefined : undefined}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(pa)}
                          disabled={!canPerformActions}
                          title={!canPerformActions ? permissionReason ?? undefined : undefined}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {productAreas.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No product areas defined. Click &quot;Add Product Area&quot; to create one.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
