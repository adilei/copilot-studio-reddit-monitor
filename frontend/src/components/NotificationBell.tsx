"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, Flame, AlertTriangle, Layers, CheckCheck, Settings, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useNotifications } from "@/lib/notification-context"
import { NotificationPreferencesDialog } from "./NotificationPreferences"

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const seconds = Math.floor((now - date) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const typeConfig = {
  boiling: { icon: Flame, label: "Boiling", className: "text-orange-600" },
  negative: { icon: AlertTriangle, label: "Negative", className: "text-red-600" },
  product_area: { icon: Layers, label: "Area", className: "text-blue-600" },
}

export function NotificationBell() {
  const router = useRouter()
  const {
    unreadCount,
    notifications,
    loadNotifications,
    markRead,
    markAllRead,
  } = useNotifications()

  const [open, setOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) {
      loadNotifications()
    }
  }

  const handleNotificationClick = async (id: number, postId: string) => {
    await markRead(id)
    setOpen(false)
    router.push(`/posts/detail?id=${postId}`)
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h4 className="text-sm font-semibold">Notifications</h4>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={markAllRead}
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setOpen(false)
                  setPrefsOpen(true)
                }}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.notification_type as keyof typeof typeConfig] || typeConfig.negative
                const Icon = config.icon

                return (
                  <div
                    key={n.id}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-accent transition-colors flex items-start gap-3 group"
                  >
                    <button
                      className="flex items-start gap-3 flex-1 min-w-0"
                      onClick={() => handleNotificationClick(n.id, n.post_id)}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.className}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${config.className}`}>
                            {config.label}
                          </span>
                          {n.product_area_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              {n.product_area_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm truncate mt-0.5">{n.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        markRead(n.id)
                      }}
                      className="shrink-0 mt-0.5 p-1 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <NotificationPreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
    </>
  )
}
