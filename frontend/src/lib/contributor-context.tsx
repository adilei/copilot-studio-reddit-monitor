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
}

const ContributorContext = createContext<ContributorContextType | undefined>(
  undefined
)

export function ContributorProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [contributor, setContributorState] = useState<Contributor | null>(null)
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [loading, setLoading] = useState(true)
  const [isAutoLinked, setIsAutoLinked] = useState(false)

  useEffect(() => {
    async function loadContributors() {
      try {
        const data = await getContributors()
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
  }, [isAuthenticated, user?.contributorId])

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
      value={{ contributor, contributors, setContributor, loading, isAutoLinked }}
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
