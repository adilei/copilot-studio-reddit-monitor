"use client"

import { useContributor } from "./contributor-context"
import { useAuth } from "./auth-context"

interface PermissionsResult {
  canPerformActions: boolean
  reason: string | null
}

/**
 * Hook to check if the current user can perform write actions.
 *
 * Returns { canPerformActions: boolean, reason: string | null }
 * - canPerformActions: true if user can checkout, resolve, add contributors, etc.
 * - reason: explains why actions are disabled (null if allowed)
 *
 * Permissions logic:
 * - When auth enabled: based on user.isReader from auth context
 * - When auth disabled: based on selected contributor's reddit_handle
 */
export function useCanPerformActions(): PermissionsResult {
  const { user, authEnabled } = useAuth()
  const { contributor, isReader } = useContributor()

  // When auth is enabled
  if (authEnabled) {
    // User must be logged in
    if (!user) {
      return {
        canPerformActions: false,
        reason: "You must be signed in to perform this action",
      }
    }

    // User must be linked to a contributor/reader
    if (!user.contributorId) {
      return {
        canPerformActions: false,
        reason: "Your account is not linked to a contributor profile",
      }
    }

    // Readers cannot perform write actions
    if (user.isReader) {
      return {
        canPerformActions: false,
        reason: "Readers cannot perform this action. Contact an admin for contributor access.",
      }
    }

    return {
      canPerformActions: true,
      reason: null,
    }
  }

  // When auth is disabled (local development)
  // Must have a contributor selected
  if (!contributor) {
    return {
      canPerformActions: false,
      reason: "Select a contributor to perform this action",
    }
  }

  // Readers (no reddit_handle) cannot perform write actions
  if (isReader) {
    return {
      canPerformActions: false,
      reason: "Readers cannot perform this action",
    }
  }

  return {
    canPerformActions: true,
    reason: null,
  }
}
