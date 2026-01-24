"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useContributor } from "@/lib/contributor-context"
import { User } from "lucide-react"

export function ContributorSelector() {
  const { contributor, contributors, setContributor, loading } =
    useContributor()

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <User className="h-4 w-4" />
        Loading...
      </div>
    )
  }

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
                <User className="h-4 w-4" />
                {contributor.name}
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
          {contributors.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              <div className="flex flex-col">
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  u/{c.reddit_handle}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
