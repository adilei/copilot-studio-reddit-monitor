"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { useContributor } from "@/lib/contributor-context"
import { useAuth } from "@/lib/auth-context"
import { User, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function ContributorSelector() {
  const { contributor, contributors, setContributor, loading, isAutoLinked, isReader } =
    useContributor()
  const { authEnabled } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <User className="h-4 w-4" />
        Loading...
      </div>
    )
  }

  // When auto-linked via auth as a reader, show read-only badge
  if (isAutoLinked && isReader) {
    return (
      <div className="px-3">
        <label className="text-xs text-muted-foreground mb-1 block">
          Working as
        </label>
        <div className="flex items-center gap-2 py-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span>{contributor?.name}</span>
          <Badge variant="secondary" className="text-xs">Reader</Badge>
        </div>
      </div>
    )
  }

  // When auto-linked via auth as a contributor, show read-only display
  if (isAutoLinked) {
    return (
      <div className="px-3">
        <label className="text-xs text-muted-foreground mb-1 block">
          Working as
        </label>
        <div className="flex items-center gap-2 py-2">
          <User className="h-4 w-4" />
          <span>{contributor?.name}</span>
        </div>
      </div>
    )
  }

  // When auth is disabled, show dropdown with grouped contributors and readers
  // Separate contributors (have reddit_handle) and readers (no reddit_handle)
  const actualContributors = contributors.filter((c) => c.reddit_handle)
  const readers = contributors.filter((c) => !c.reddit_handle)
  const hasReaders = readers.length > 0

  return (
    <div className="px-3">
      <label className="text-xs text-muted-foreground mb-1 block">
        Working as
      </label>
      <Select
        value={contributor?.id.toString() || "none"}
        onValueChange={(value) => {
          if (value === "none") {
            setContributor(null)
          } else {
            const selected = contributors.find(
              (c) => c.id === parseInt(value, 10)
            )
            if (selected) {
              setContributor(selected)
            }
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select contributor">
            {contributor ? (
              <span className="flex items-center gap-2">
                {contributor.reddit_handle ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
                {contributor.name}
                {!contributor.reddit_handle && (
                  <span className="text-xs text-muted-foreground">(Reader)</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Not selected</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <span className="text-muted-foreground">Not selected</span>
          </SelectItem>
          {hasReaders ? (
            <>
              <SelectGroup>
                <SelectLabel>Contributors</SelectLabel>
                {actualContributors.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    <div className="flex flex-col">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        u/{c.reddit_handle}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Readers</SelectLabel>
                {readers.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Eye className="h-3 w-3 text-muted-foreground" />
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">(View only)</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : (
            // No readers, just show flat list
            actualContributors.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                <div className="flex flex-col">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    u/{c.reddit_handle}
                  </span>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
