// Simple token store module to avoid circular dependencies

type TokenGetter = () => Promise<string | null>

let tokenGetter: TokenGetter | null = null

export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter
}

export function getTokenGetter(): TokenGetter | null {
  return tokenGetter
}
