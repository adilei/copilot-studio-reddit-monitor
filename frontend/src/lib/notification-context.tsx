"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react"
import { useContributor } from "./contributor-context"
import {
  getUnreadCount,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences as updatePrefsApi,
  subscribeToPush,
  unsubscribeFromPush,
  getVapidPublicKey,
  type NotificationItem,
  type NotificationPreferences,
} from "./api"

interface NotificationContextType {
  unreadCount: number
  notifications: NotificationItem[]
  preferences: NotificationPreferences | null
  loadNotifications: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>
  enablePush: () => Promise<boolean>
  disablePush: () => Promise<void>
  loading: boolean
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { contributor } = useContributor()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(false)

  const contributorId = contributor?.id

  // Poll unread count every 2 minutes
  useEffect(() => {
    if (!contributorId) {
      setUnreadCount(0)
      return
    }

    const fetchCount = async () => {
      try {
        const { unread_count } = await getUnreadCount(contributorId)
        setUnreadCount(unread_count)
        // Update app badge if supported
        if ("setAppBadge" in navigator) {
          if (unread_count > 0) {
            (navigator as any).setAppBadge(unread_count)
          } else {
            (navigator as any).clearAppBadge()
          }
        }
      } catch {
        // Silently fail for polling
      }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [contributorId])

  // Load preferences when contributor changes
  useEffect(() => {
    if (!contributorId) {
      setPreferences(null)
      return
    }

    getNotificationPreferences(contributorId)
      .then(setPreferences)
      .catch(() => setPreferences(null))
  }, [contributorId])

  const loadNotifications = useCallback(async () => {
    if (!contributorId) return
    setLoading(true)
    try {
      const items = await getNotifications({ contributor_id: contributorId, unread_only: true, limit: 50 })
      setNotifications(items)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [contributorId])

  const markRead = useCallback(async (id: number) => {
    if (!contributorId) return
    await markNotificationRead(id, contributorId)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [contributorId])

  const markAllRead = useCallback(async () => {
    if (!contributorId) return
    await markAllNotificationsRead(contributorId)
    setNotifications([])
    setUnreadCount(0)
    if ("clearAppBadge" in navigator) {
      (navigator as any).clearAppBadge()
    }
  }, [contributorId])

  const updatePreferences = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    if (!contributorId) return
    const updated = await updatePrefsApi(prefs, contributorId)
    setPreferences(updated)
  }, [contributorId])

  const enablePush = useCallback(async (): Promise<boolean> => {
    if (!contributorId) return false
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return false

    try {
      const { vapid_public_key } = await getVapidPublicKey()
      if (!vapid_public_key) return false

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid_public_key).buffer as ArrayBuffer,
      })

      const json = subscription.toJSON()
      await subscribeToPush(
        {
          endpoint: json.endpoint!,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        contributorId
      )

      await updatePreferences({ push_enabled: true })
      return true
    } catch (err) {
      console.error("Push subscription failed:", err)
      return false
    }
  }, [contributorId, updatePreferences])

  const disablePush = useCallback(async () => {
    if (!contributorId) return

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint, contributorId)
        await subscription.unsubscribe()
      }
      await updatePreferences({ push_enabled: false })
    } catch (err) {
      console.error("Push unsubscription failed:", err)
    }
  }, [contributorId, updatePreferences])

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        preferences,
        loadNotifications,
        markRead,
        markAllRead,
        updatePreferences,
        enablePush,
        disablePush,
        loading,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}
