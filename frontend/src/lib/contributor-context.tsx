"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react"
import { getContributors, type Contributor } from "./api"
import { useAuth } from "./auth-context"

const STORAGE_KEY = "selected_contributor_id"

interface ContributorContextType {
  contributor: Contributor | null
  contributors: Contributor[]
  setContributor: (contributor: Contributor | null) => void
  loading: boolean
  isAutoLinked: boolean
  isReader: boolean
}

const ContributorContext = createContext<ContributorContextType | undefined>(
  undefined
)

export function ContributorProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading, authEnabled } = useAuth()
  const [contributor, setContributorState] = useState<Contributor | null>(null)
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [loading, setLoading] = useState(true)
  const [isAutoLinked, setIsAutoLinked] = useState(false)

  // Compute isReader based on context:
  // - When auth enabled: use user.isReader from auth context
  // - When auth disabled: compute from selected contributor
  const isReader = isAuthenticated && user
    ? user.isReader
    : contributor?.reddit_handle === null

  useEffect(() => {
    // Wait for auth to be fully initialized before fetching contributors
    if (authLoading) return

    async function loadContributors() {
      try {
        // When auth is disabled, include readers so users can test reader behavior
        const includeReaders = !authEnabled
        const data = await getContributors(false, includeReaders)
        setContributors(data)

        // If user is authenticated and has a linked contributor, auto-select it
        if (isAuthenticated && user?.contributorId) {
          const linked = data.find((c) => c.id === user.contributorId)
          if (linked) {
            setContributorState(linked)
            setIsAutoLinked(true)
            setLoading(false)
            return
          }
        }

        // Otherwise, load saved contributor from localStorage (for non-auth mode)
        if (!isAuthenticated) {
          const savedId = localStorage.getItem(STORAGE_KEY)
          if (savedId) {
            const saved = data.find((c) => c.id === parseInt(savedId, 10))
            if (saved) {
              setContributorState(saved)
            }
          }
        }
      } catch (error) {
        console.error("Failed to load contributors:", error)
      } finally {
        setLoading(false)
      }
    }

    loadContributors()
  }, [isAuthenticated, authLoading, authEnabled, user?.contributorId])

  function setContributor(contributor: Contributor | null) {
    // Don't allow changing if auto-linked via auth
    if (isAutoLinked) return

    setContributorState(contributor)
    if (contributor) {
      localStorage.setItem(STORAGE_KEY, contributor.id.toString())
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <ContributorContext.Provider
      value={{ contributor, contributors, setContributor, loading, isAutoLinked, isReader }}
    >
      {children}
    </ContributorContext.Provider>
  )
}

export function useContributor() {
  const context = useContext(ContributorContext)
  if (context === undefined) {
    throw new Error("useContributor must be used within a ContributorProvider")
  }
  return context
}
