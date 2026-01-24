"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react"
import { getContributors, type Contributor } from "./api"

const STORAGE_KEY = "selected_contributor_id"

interface ContributorContextType {
  contributor: Contributor | null
  contributors: Contributor[]
  setContributor: (contributor: Contributor | null) => void
  loading: boolean
}

const ContributorContext = createContext<ContributorContextType | undefined>(
  undefined
)

export function ContributorProvider({ children }: { children: ReactNode }) {
  const [contributor, setContributorState] = useState<Contributor | null>(null)
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadContributors() {
      try {
        const data = await getContributors()
        setContributors(data)

        // Load saved contributor from localStorage
        const savedId = localStorage.getItem(STORAGE_KEY)
        if (savedId) {
          const saved = data.find((c) => c.id === parseInt(savedId, 10))
          if (saved) {
            setContributorState(saved)
          }
        }
      } catch (error) {
        console.error("Failed to load contributors:", error)
      } finally {
        setLoading(false)
      }
    }

    loadContributors()
  }, [])

  function setContributor(contributor: Contributor | null) {
    setContributorState(contributor)
    if (contributor) {
      localStorage.setItem(STORAGE_KEY, contributor.id.toString())
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <ContributorContext.Provider
      value={{ contributor, contributors, setContributor, loading }}
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
