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
import { useAuth } from "@/lib/auth-context"
import { User, ChevronDown, Check, LogIn, LogOut, Copy } from "lucide-react"

export function Header() {
  const { contributor, contributors, setContributor, loading } = useContributor()
  const { user, isAuthenticated, isLoading: authLoading, login, logout, getAccessToken } = useAuth()

  return (
    <header className="h-14 border-b bg-card flex items-center justify-end px-6 gap-4">
      {/* Auth section */}
      {authLoading ? (
        <span className="text-sm text-muted-foreground">Loading...</span>
      ) : isAuthenticated && user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
                {user.name?.charAt(0).toUpperCase() || user.alias?.charAt(0).toUpperCase() || "?"}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm">{user.name || user.alias}</span>
                {user.contributorId && (
                  <span className="text-xs text-green-600">Linked</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            {user.contributorId && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <span className="text-xs text-muted-foreground">Linked as contributor:</span>
                  <span className="text-sm font-medium block">{user.contributorName}</span>
                </div>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                const token = await getAccessToken()
                if (token) {
                  navigator.clipboard.writeText(token)
                  alert("Token copied to clipboard")
                }
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy token
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" size="sm" onClick={login} className="flex items-center gap-2">
          <LogIn className="h-4 w-4" />
          Sign in with Microsoft
        </Button>
      )}

      {/* Contributor selector - only show if not using auth or auth is not configured */}
      {!isAuthenticated && (
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
      )}
    </header>
  )
}
