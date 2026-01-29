import { Configuration, LogLevel } from "@azure/msal-browser"

// Azure AD configuration from environment variables
const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID || ""
const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID || ""

if (!clientId || !tenantId) {
  console.warn("Azure AD environment variables not set. Auth will be disabled.")
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
    postLogoutRedirectUri:
      typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return
        switch (level) {
          case LogLevel.Error:
            console.error(message)
            break
          case LogLevel.Warning:
            console.warn(message)
            break
          case LogLevel.Info:
            // console.info(message)
            break
          case LogLevel.Verbose:
            // console.debug(message)
            break
        }
      },
    },
  },
}

// Scopes for login - just basic profile info
export const loginRequest = {
  scopes: ["User.Read", "openid", "profile", "email"],
}

// Scopes for API calls - use the same scopes as login for now
// This gets an access token for Graph API which we use to verify identity
export const apiRequest = {
  scopes: ["User.Read"],
}

export const isAuthConfigured = Boolean(clientId && tenantId)
