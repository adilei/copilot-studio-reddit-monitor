"use client"

import { useEffect, useState } from "react"
import { ContributorList } from "@/components/ContributorList"
import { getContributors, type Contributor } from "@/lib/api"

export default function ContributorsPage() {
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContributors()
  }, [])

  async function loadContributors() {
    try {
      const data = await getContributors()
      setContributors(data)
    } catch (error) {
      console.error("Failed to load contributors:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading contributors...</div>
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contributors</h1>
        <p className="text-muted-foreground">
          Manage Microsoft team members who respond to Reddit posts
        </p>
      </div>

      <ContributorList contributors={contributors} onUpdate={loadContributors} />
    </div>
  )
}
