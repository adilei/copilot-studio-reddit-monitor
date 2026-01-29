"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react"
import {
  PublicClientApplication,
  InteractionStatus,
  InteractionRequiredAuthError,
} from "@azure/msal-browser"
import {
  MsalProvider,
  useMsal,
  useIsAuthenticated,
} from "@azure/msal-react"
import { msalConfig, loginRequest, apiRequest, isAuthConfigured } from "./msal-config"
import { setTokenGetter } from "./token-store"

// Initialize MSAL instance lazily (only on client side)
let msalInstance: PublicClientApplication | null = null

function getMsalInstance(): PublicClientApplication {
  if (!msalInstance && typeof window !== "undefined") {
    msalInstance = new PublicClientApplication(msalConfig)
  }
  return msalInstance!
}

// Types
export interface AuthUser {
  email: string | null
  name: string | null
  alias: string | null
  contributorId: number | null
  contributorName: string | null
}

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => Promise<void>
  logout: () => void
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Inner provider that uses MSAL hooks
function AuthProviderInner({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get ID token for API calls
  // We use ID token because its audience is our client ID (no need to set up "Expose an API")
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!isAuthConfigured) return null
    if (accounts.length === 0) return null

    try {
      const response = await instance.acquireTokenSilent({
        ...apiRequest,
        account: accounts[0],
      })
      // Use ID token instead of access token - audience is our client ID
      return response.idToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token expired or needs interaction, trigger login
        try {
          const response = await instance.acquireTokenPopup(apiRequest)
          return response.idToken
        } catch (popupError) {
          console.error("Failed to acquire token via popup:", popupError)
          return null
        }
      }
      console.error("Failed to acquire token:", error)
      return null
    }
  }, [instance, accounts])

  // Set up token getter for API module
  useEffect(() => {
    setTokenGetter(getAccessToken)
  }, [getAccessToken])

  // Fetch user info from backend after authentication
  useEffect(() => {
    async function fetchUserInfo() {
      if (!isAuthConfigured) {
        setIsLoading(false)
        return
      }

      if (inProgress !== InteractionStatus.None) {
        return
      }

      if (!isAuthenticated || accounts.length === 0) {
        setUser(null)
        setIsLoading(false)
        return
      }

      try {
        const token = await getAccessToken()
        if (!token) {
          setUser(null)
          setIsLoading(false)
          return
        }

        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setUser({
            email: data.email,
            name: data.name,
            alias: data.alias,
            contributorId: data.contributor_id,
            contributorName: data.contributor_name,
          })
        } else {
          // User is authenticated with Azure AD but backend rejected
          const account = accounts[0]
          setUser({
            email: account.username,
            name: account.name || null,
            alias: account.username?.split("@")[0] || null,
            contributorId: null,
            contributorName: null,
          })
        }
      } catch (error) {
        console.error("Failed to fetch user info:", error)
        // Set basic info from MSAL account
        const account = accounts[0]
        setUser({
          email: account.username,
          name: account.name || null,
          alias: account.username?.split("@")[0] || null,
          contributorId: null,
          contributorName: null,
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserInfo()
  }, [isAuthenticated, accounts, inProgress, getAccessToken])

  const login = useCallback(async () => {
    if (!isAuthConfigured) {
      console.warn("Auth not configured")
      return
    }
    try {
      await instance.loginPopup(loginRequest)
    } catch (error) {
      console.error("Login failed:", error)
    }
  }, [instance])

  const logout = useCallback(() => {
    if (!isAuthConfigured) return
    instance.logoutPopup()
  }, [instance])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: isAuthConfigured && isAuthenticated,
        isLoading: isAuthConfigured && isLoading,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Outer provider that wraps with MsalProvider
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // If auth is not configured, just render children without auth
  if (!isAuthConfigured) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          isAuthenticated: false,
          isLoading: false,
          login: async () => {
            console.warn("Auth not configured")
          },
          logout: () => {
            console.warn("Auth not configured")
          },
          getAccessToken: async () => null,
        }}
      >
        {children}
      </AuthContext.Provider>
    )
  }

  // Wait for client-side mount before initializing MSAL
  if (!isMounted) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          isAuthenticated: false,
          isLoading: true,
          login: async () => {},
          logout: () => {},
          getAccessToken: async () => null,
        }}
      >
        {children}
      </AuthContext.Provider>
    )
  }

  return (
    <MsalProvider instance={getMsalInstance()}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
