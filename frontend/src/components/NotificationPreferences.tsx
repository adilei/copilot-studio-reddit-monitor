"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useNotifications } from "@/lib/notification-context"
import { getProductAreas, type ProductArea } from "@/lib/api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NotificationPreferencesDialog({ open, onOpenChange }: Props) {
  const { preferences, updatePreferences, enablePush, disablePush } = useNotifications()
  const [productAreas, setProductAreas] = useState<ProductArea[]>([])
  const [saving, setSaving] = useState(false)

  // Local state for form
  const [boiling, setBoiling] = useState(true)
  const [negative, setNegative] = useState(true)
  const [selectedAreas, setSelectedAreas] = useState<number[]>([])
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    if (open) {
      getProductAreas().then(setProductAreas).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (preferences) {
      setBoiling(preferences.boiling_enabled)
      setNegative(preferences.negative_enabled)
      setSelectedAreas(preferences.product_areas)
      setPushEnabled(preferences.push_enabled)
    }
  }, [preferences])

  const toggleArea = (id: number) => {
    setSelectedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePreferences({
        boiling_enabled: boiling,
        negative_enabled: negative,
        product_areas: selectedAreas,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handlePushToggle = async () => {
    setSaving(true)
    try {
      if (pushEnabled) {
        await disablePush()
        setPushEnabled(false)
      } else {
        const ok = await enablePush()
        setPushEnabled(ok)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>
            Choose which posts trigger notifications for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Alert types</h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={boiling}
                onChange={(e) => setBoiling(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <span className="text-sm">Boiling posts</span>
                <p className="text-xs text-muted-foreground">Posts flagged as warning/escalation</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={negative}
                onChange={(e) => setNegative(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <span className="text-sm">Negative sentiment</span>
                <p className="text-xs text-muted-foreground">Posts analyzed as negative</p>
              </div>
            </label>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Product areas</h4>
            <p className="text-xs text-muted-foreground">
              Get notified about posts in specific product areas
            </p>
            <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
              {productAreas.map((area) => (
                <label key={area.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAreas.includes(area.id)}
                    onChange={() => toggleArea(area.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  <span className="text-sm">{area.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <h4 className="text-sm font-medium">Push notifications</h4>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm">Enable push notifications</span>
                <p className="text-xs text-muted-foreground">
                  Receive native OS notifications
                </p>
              </div>
              <Button
                variant={pushEnabled ? "destructive" : "default"}
                size="sm"
                onClick={handlePushToggle}
                disabled={saving}
              >
                {pushEnabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
