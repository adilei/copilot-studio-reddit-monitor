"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useContributor } from "@/lib/contributor-context"
import { User, ChevronDown, Check } from "lucide-react"

export function Header() {
  const { contributor, contributors, setContributor, loading } = useContributor()

  return (
    <header className="h-14 border-b bg-card flex items-center justify-end px-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            {loading ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : contributor ? (
              <>
                <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  {contributor.name.charAt(0).toUpperCase()}
                </div>
                <span>{contributor.name}</span>
              </>
            ) : (
              <>
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-muted-foreground">Select contributor</span>
              </>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Working as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setContributor(null)}
            className="flex items-center justify-between"
          >
            <span className="text-muted-foreground">Not selected</span>
            {!contributor && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
          {contributors.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => setContributor(c)}
              className="flex items-center justify-between"
            >
              <div className="flex flex-col">
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  u/{c.reddit_handle}
                </span>
              </div>
              {contributor?.id === c.id && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
